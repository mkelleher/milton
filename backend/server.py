from fastapi import FastAPI, APIRouter, HTTPException, Query, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta
import finnhub
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from cachetools import TTLCache
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import asyncio


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# External API clients
finnhub_client = finnhub.Client(api_key=os.environ.get('FINNHUB_API_KEY', ''))
youtube = build('youtube', 'v3', developerKey=os.environ.get('YOUTUBE_API_KEY', ''))

# Cache for stock data (30 second TTL)
stock_cache = TTLCache(maxsize=100, ttl=30)

# Rate limiter
limiter = Limiter(key_func=get_remote_address)

# Scheduler for background tasks
scheduler = AsyncIOScheduler()

# Create the main app
app = FastAPI(title="MiltonTV API", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StockChannel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    channelNumber: int
    ticker: str
    companyName: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Video(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    videoId: str
    title: str
    description: str
    thumbnail: str
    source: str
    trustTier: str
    stockTicker: str
    duration: Optional[str] = None
    publishedAt: Optional[str] = None
    channelTitle: Optional[str] = None
    viewCount: Optional[int] = 0
    qualityScore: Optional[float] = 0.0
    cached_at: datetime = Field(default_factory=datetime.utcnow)

class StockData(BaseModel):
    ticker: str
    currentPrice: float
    change: float
    percentChange: float
    high: float
    low: float
    open: float
    previousClose: float
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    page: int
    page_size: int
    total_pages: int


# Top 50 most traded stocks
TOP_50_STOCKS = [
    {"ticker": "AAPL", "name": "Apple Inc."},
    {"ticker": "MSFT", "name": "Microsoft Corporation"},
    {"ticker": "GOOGL", "name": "Alphabet Inc."},
    {"ticker": "AMZN", "name": "Amazon.com Inc."},
    {"ticker": "NVDA", "name": "NVIDIA Corporation"},
    {"ticker": "TSLA", "name": "Tesla Inc."},
    {"ticker": "META", "name": "Meta Platforms Inc."},
    {"ticker": "BRK.B", "name": "Berkshire Hathaway Inc."},
    {"ticker": "JPM", "name": "JPMorgan Chase & Co."},
    {"ticker": "V", "name": "Visa Inc."},
    {"ticker": "JNJ", "name": "Johnson & Johnson"},
    {"ticker": "WMT", "name": "Walmart Inc."},
    {"ticker": "PG", "name": "Procter & Gamble Co."},
    {"ticker": "MA", "name": "Mastercard Inc."},
    {"ticker": "HD", "name": "Home Depot Inc."},
    {"ticker": "DIS", "name": "Walt Disney Co."},
    {"ticker": "BAC", "name": "Bank of America Corp."},
    {"ticker": "CSCO", "name": "Cisco Systems Inc."},
    {"ticker": "ADBE", "name": "Adobe Inc."},
    {"ticker": "NFLX", "name": "Netflix Inc."},
    {"ticker": "CRM", "name": "Salesforce Inc."},
    {"ticker": "PFE", "name": "Pfizer Inc."},
    {"ticker": "TMO", "name": "Thermo Fisher Scientific"},
    {"ticker": "INTC", "name": "Intel Corporation"},
    {"ticker": "CMCSA", "name": "Comcast Corporation"},
    {"ticker": "VZ", "name": "Verizon Communications"},
    {"ticker": "AMD", "name": "Advanced Micro Devices"},
    {"ticker": "T", "name": "AT&T Inc."},
    {"ticker": "ORCL", "name": "Oracle Corporation"},
    {"ticker": "NKE", "name": "Nike Inc."},
    {"ticker": "PYPL", "name": "PayPal Holdings Inc."},
    {"ticker": "COIN", "name": "Coinbase Global Inc."},
    {"ticker": "BA", "name": "Boeing Co."},
    {"ticker": "IBM", "name": "IBM Corporation"},
    {"ticker": "GE", "name": "General Electric Co."},
    {"ticker": "F", "name": "Ford Motor Co."},
    {"ticker": "GM", "name": "General Motors Co."},
    {"ticker": "UBER", "name": "Uber Technologies Inc."},
    {"ticker": "LYFT", "name": "Lyft Inc."},
    {"ticker": "SNAP", "name": "Snap Inc."},
    {"ticker": "SQ", "name": "Block Inc."},
    {"ticker": "ROKU", "name": "Roku Inc."},
    {"ticker": "SPOT", "name": "Spotify Technology"},
    {"ticker": "ZM", "name": "Zoom Video Communications"},
    {"ticker": "SHOP", "name": "Shopify Inc."},
    {"ticker": "PLTR", "name": "Palantir Technologies"},
    {"ticker": "RBLX", "name": "Roblox Corporation"},
    {"ticker": "RIVN", "name": "Rivian Automotive Inc."},
    {"ticker": "LCID", "name": "Lucid Group Inc."},
    {"ticker": "NIO", "name": "NIO Inc."}
]


# Helper Functions
def calculate_video_quality_score(video_data: Dict) -> float:
    """Calculate quality score based on video metrics"""
    try:
        views = int(video_data.get('viewCount', 0))
        likes = int(video_data.get('likeCount', 0))
        comments = int(video_data.get('commentCount', 0))
        
        # Normalize scores
        view_score = min(views / 100000, 1.0) * 0.5  # Max 0.5
        engagement_score = min((likes + comments) / 10000, 1.0) * 0.3  # Max 0.3
        recency_score = 0.2  # Base recency score
        
        # Check published date
        published = video_data.get('publishedAt', '')
        if published:
            pub_date = datetime.fromisoformat(published.replace('Z', '+00:00'))
            days_old = (datetime.now(pub_date.tzinfo) - pub_date).days
            recency_score = max(0.2 - (days_old / 365) * 0.2, 0)
        
        total_score = view_score + engagement_score + recency_score
        return round(total_score, 2)
    except Exception as e:
        logger.warning(f"Error calculating quality score: {e}")
        return 0.0


def determine_trust_tier(channel_title: str) -> str:
    """Determine trust tier based on channel title"""
    channel_lower = channel_title.lower()
    
    # Official company channels
    if any(word in channel_lower for word in ['official', 'investor relations', 'ir']):
        return "Official Company"
    
    # Professional news outlets
    news_outlets = ['bloomberg', 'cnbc', 'reuters', 'financial times', 'wall street journal', 
                   'marketwatch', 'seeking alpha', 'yahoo finance', 'the motley fool']
    if any(outlet in channel_lower for outlet in news_outlets):
        return "Professional News"
    
    # Vetted experts
    expert_keywords = ['cfa', 'analyst', 'investing', 'finance']
    if any(keyword in channel_lower for keyword in expert_keywords):
        return "Vetted Expert"
    
    return "Community"


async def create_indexes():
    """Create database indexes for performance"""
    try:
        # Index on ticker for channels
        await db.stock_channels.create_index("ticker", unique=True)
        await db.stock_channels.create_index("channelNumber")
        
        # Indexes on videos
        await db.videos.create_index("stockTicker")
        await db.videos.create_index("videoId")
        await db.videos.create_index("cached_at")
        await db.videos.create_index([("stockTicker", 1), ("qualityScore", -1)])
        
        logger.info("Database indexes created successfully")
    except Exception as e:
        logger.error(f"Error creating indexes: {e}")


# Background task to refresh videos
async def refresh_all_videos():
    """Background task to refresh videos for all channels"""
    try:
        logger.info("Starting scheduled video refresh")
        channels = await db.stock_channels.find().to_list(100)
        
        for channel in channels:
            try:
                # Delete old cached videos (older than 24 hours)
                cutoff_time = datetime.utcnow() - timedelta(hours=24)
                await db.videos.delete_many({
                    "stockTicker": channel['ticker'],
                    "cached_at": {"$lt": cutoff_time}
                })
                
                # Fetch fresh videos
                await fetch_and_cache_youtube_videos(channel['ticker'])
                await asyncio.sleep(2)  # Rate limiting
            except Exception as e:
                logger.error(f"Error refreshing videos for {channel['ticker']}: {e}")
        
        logger.info("Completed scheduled video refresh")
    except Exception as e:
        logger.error(f"Error in refresh_all_videos: {e}")


async def fetch_and_cache_youtube_videos(ticker: str, max_results: int = 10) -> List[Video]:
    """Fetch videos from YouTube and cache in database with quality scores"""
    try:
        # Get company name
        channel = await db.stock_channels.find_one({"ticker": ticker})
        if not channel:
            raise HTTPException(status_code=404, detail=f"Channel {ticker} not found")
        
        company_name = channel['companyName']
        search_query = f"{company_name} {ticker} stock analysis news"
        
        # Search YouTube
        search_response = youtube.search().list(
            q=search_query,
            part='id,snippet',
            maxResults=max_results,
            type='video',
            order='relevance',
            relevanceLanguage='en'
        ).execute()
        
        video_ids = [item['id']['videoId'] for item in search_response.get('items', [])]
        
        # Get detailed video statistics
        videos_response = youtube.videos().list(
            part='snippet,statistics',
            id=','.join(video_ids)
        ).execute()
        
        videos = []
        for item in videos_response.get('items', []):
            video_id = item['id']
            snippet = item['snippet']
            statistics = item.get('statistics', {})
            
            # Calculate quality score
            quality_score = calculate_video_quality_score({
                'viewCount': statistics.get('viewCount', 0),
                'likeCount': statistics.get('likeCount', 0),
                'commentCount': statistics.get('commentCount', 0),
                'publishedAt': snippet.get('publishedAt')
            })
            
            trust_tier = determine_trust_tier(snippet.get('channelTitle', ''))
            
            video = Video(
                videoId=video_id,
                title=snippet['title'],
                description=snippet['description'],
                thumbnail=snippet['thumbnails']['high']['url'],
                source="YouTube",
                trustTier=trust_tier,
                stockTicker=ticker,
                publishedAt=snippet['publishedAt'],
                channelTitle=snippet.get('channelTitle', ''),
                viewCount=int(statistics.get('viewCount', 0)),
                qualityScore=quality_score
            )
            videos.append(video)
        
        # Store in database (upsert)
        if videos:
            for video in videos:
                await db.videos.update_one(
                    {"videoId": video.videoId, "stockTicker": ticker},
                    {"$set": video.dict()},
                    upsert=True
                )
        
        return videos
    except HttpError as e:
        logger.error(f"YouTube API error: {e}")
        raise HTTPException(status_code=500, detail="YouTube API error")
    except Exception as e:
        logger.error(f"Error fetching YouTube videos: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# API Endpoints
@api_router.post("/init-channels")
@limiter.limit("10/minute")
async def initialize_channels(request: Request):
    """Initialize the database with top 50 stock channels"""
    try:
        existing = await db.stock_channels.count_documents({})
        if existing > 0:
            return {"message": f"Channels already initialized. Found {existing} channels."}
        
        channels = []
        for idx, stock in enumerate(TOP_50_STOCKS, start=1):
            channel = StockChannel(
                channelNumber=idx,
                ticker=stock["ticker"],
                companyName=stock["name"]
            )
            channels.append(channel.dict())
        
        result = await db.stock_channels.insert_many(channels)
        
        # Create indexes
        await create_indexes()
        
        return {
            "message": f"Successfully initialized {len(result.inserted_ids)} channels",
            "channels": len(channels)
        }
    except Exception as e:
        logger.error(f"Error initializing channels: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/channels", response_model=List[StockChannel])
@limiter.limit("30/minute")
async def get_all_channels(request: Request):
    """Get all stock channels"""
    try:
        channels = await db.stock_channels.find().sort("channelNumber", 1).to_list(100)
        return [StockChannel(**channel) for channel in channels]
    except Exception as e:
        logger.error(f"Error fetching channels: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/channels/{ticker}")
@limiter.limit("30/minute")
async def get_channel(request: Request, ticker: str):
    """Get specific channel by ticker"""
    try:
        ticker = ticker.upper()
        channel = await db.stock_channels.find_one({"ticker": ticker})
        if not channel:
            raise HTTPException(status_code=404, detail=f"Channel {ticker} not found")
        return StockChannel(**channel)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching channel {ticker}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/stock/{ticker}")
@limiter.limit("60/minute")
async def get_stock_data(request: Request, ticker: str):
    """Get real-time stock data from Finnhub with caching"""
    try:
        ticker = ticker.upper()
        
        # Check cache first
        if ticker in stock_cache:
            logger.info(f"Returning cached stock data for {ticker}")
            return stock_cache[ticker]
        
        # Fetch from Finnhub
        quote = finnhub_client.quote(ticker)
        
        if not quote or quote.get('c') == 0:
            raise HTTPException(status_code=404, detail=f"Stock data not found for {ticker}")
        
        stock_data = StockData(
            ticker=ticker,
            currentPrice=quote['c'],
            change=quote['d'],
            percentChange=quote['dp'],
            high=quote['h'],
            low=quote['l'],
            open=quote['o'],
            previousClose=quote['pc']
        )
        
        # Cache the result
        stock_cache[ticker] = stock_data
        
        return stock_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching stock data for {ticker}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/channels/{ticker}/videos")
@limiter.limit("30/minute")
async def get_channel_videos(
    request: Request,
    ticker: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    trust_tier: Optional[str] = None,
    sort_by: str = Query("quality", regex="^(quality|date|views)$")
):
    """Get videos for a channel with pagination and filtering"""
    try:
        ticker = ticker.upper()
        
        # Check if we have cached videos (less than 1 hour old)
        cutoff_time = datetime.utcnow() - timedelta(hours=1)
        query = {"stockTicker": ticker, "cached_at": {"$gte": cutoff_time}}
        
        if trust_tier:
            query["trustTier"] = trust_tier
        
        # Get cached videos
        cached_videos = await db.videos.find(query).to_list(1000)
        
        # If no cached videos or very few, fetch from YouTube
        if len(cached_videos) < 5:
            logger.info(f"Fetching fresh videos for {ticker}")
            await fetch_and_cache_youtube_videos(ticker, max_results=20)
            cached_videos = await db.videos.find(query).to_list(1000)
        
        # Sort videos
        if sort_by == "quality":
            cached_videos.sort(key=lambda x: x.get('qualityScore', 0), reverse=True)
        elif sort_by == "date":
            cached_videos.sort(key=lambda x: x.get('publishedAt', ''), reverse=True)
        elif sort_by == "views":
            cached_videos.sort(key=lambda x: x.get('viewCount', 0), reverse=True)
        
        # Pagination
        total = len(cached_videos)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated_videos = cached_videos[start_idx:end_idx]
        
        return {
            "items": [Video(**v) for v in paginated_videos],
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size
        }
    except Exception as e:
        logger.error(f"Error fetching videos for {ticker}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/search/videos")
@limiter.limit("20/minute")
async def search_videos(
    request: Request,
    query: str = Query(..., min_length=2),
    trust_tier: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50)
):
    """Search videos across all channels"""
    try:
        search_query = {"$text": {"$search": query}}
        
        if trust_tier:
            search_query["trustTier"] = trust_tier
        
        # Count total
        total = await db.videos.count_documents(search_query)
        
        # Get paginated results
        skip = (page - 1) * page_size
        videos = await db.videos.find(search_query).sort("qualityScore", -1).skip(skip).limit(page_size).to_list(page_size)
        
        return {
            "items": [Video(**v) for v in videos],
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size
        }
    except Exception as e:
        logger.error(f"Error searching videos: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/")
async def root():
    return {"message": "MiltonTV API - Stock Video Streaming Platform", "version": "1.0.0"}


@api_router.get("/health")
async def health_check():
    """Enhanced health check with cache and DB status"""
    try:
        # Check database connection
        await db.command("ping")
        db_status = "connected"
    except:
        db_status = "disconnected"
    
    return {
        "status": "healthy",
        "version": "1.0.0",
        "database": db_status,
        "cache_size": len(stock_cache),
        "finnhub": bool(os.environ.get('FINNHUB_API_KEY')),
        "youtube": bool(os.environ.get('YOUTUBE_API_KEY')),
        "timestamp": datetime.utcnow().isoformat()
    }


@api_router.get("/stats")
@limiter.limit("10/minute")
async def get_stats(request: Request):
    """Get platform statistics"""
    try:
        total_channels = await db.stock_channels.count_documents({})
        total_videos = await db.videos.count_documents({})
        
        # Videos by trust tier
        trust_tier_pipeline = [
            {"$group": {"_id": "$trustTier", "count": {"$sum": 1}}}
        ]
        trust_tier_stats = await db.videos.aggregate(trust_tier_pipeline).to_list(10)
        
        return {
            "total_channels": total_channels,
            "total_videos": total_videos,
            "cache_hits": len(stock_cache),
            "trust_tier_distribution": {item['_id']: item['count'] for item in trust_tier_stats}
        }
    except Exception as e:
        logger.error(f"Error fetching stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Include router
app.include_router(api_router)

# Add CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# Startup event
@app.on_event("startup")
async def startup_event():
    logger.info("Starting MiltonTV API...")
    
    # Create database indexes
    await create_indexes()
    
    # Schedule background tasks
    scheduler.add_job(refresh_all_videos, 'interval', hours=6, id='refresh_videos')
    scheduler.start()
    
    logger.info("MiltonTV API started successfully")


@app.on_event("shutdown")
async def shutdown_event():
    scheduler.shutdown()
    client.close()
    logger.info("MiltonTV API shutdown complete")
