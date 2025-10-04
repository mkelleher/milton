from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
import finnhub
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# External API clients
finnhub_client = finnhub.Client(api_key=os.environ.get('FINNHUB_API_KEY', ''))
youtube = build('youtube', 'v3', developerKey=os.environ.get('YOUTUBE_API_KEY', ''))

# Create the main app without a prefix
app = FastAPI()

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
    videoId: str  # YouTube video ID
    title: str
    description: str
    thumbnail: str
    source: str  # e.g., "YouTube", "Company IR"
    trustTier: str  # "Official Company", "Professional News", "Vetted Expert", "Community"
    stockTicker: str
    duration: Optional[str] = None
    publishedAt: Optional[str] = None
    channelTitle: Optional[str] = None

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

class ChannelWithVideos(BaseModel):
    channel: StockChannel
    videos: List[Video]
    currentVideo: Optional[Video] = None


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


# Initialize database with stock channels
@api_router.post("/init-channels")
async def initialize_channels():
    """Initialize the database with top 50 stock channels"""
    try:
        # Check if channels already exist
        existing = await db.stock_channels.count_documents({})
        if existing > 0:
            return {"message": f"Channels already initialized. Found {existing} channels."}
        
        # Create channels
        channels = []
        for idx, stock in enumerate(TOP_50_STOCKS, start=1):
            channel = StockChannel(
                channelNumber=idx,
                ticker=stock["ticker"],
                companyName=stock["name"]
            )
            channels.append(channel.dict())
        
        result = await db.stock_channels.insert_many(channels)
        return {
            "message": f"Successfully initialized {len(result.inserted_ids)} channels",
            "channels": len(channels)
        }
    except Exception as e:
        logger.error(f"Error initializing channels: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Get all channels
@api_router.get("/channels", response_model=List[StockChannel])
async def get_all_channels():
    """Get all stock channels"""
    try:
        channels = await db.stock_channels.find().sort("channelNumber", 1).to_list(100)
        return [StockChannel(**channel) for channel in channels]
    except Exception as e:
        logger.error(f"Error fetching channels: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Get specific channel
@api_router.get("/channels/{ticker}")
async def get_channel(ticker: str):
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


# Get real-time stock data from Finnhub
@api_router.get("/stock/{ticker}")
async def get_stock_data(ticker: str):
    """Get real-time stock data from Finnhub"""
    try:
        ticker = ticker.upper()
        
        # Get quote data
        quote = finnhub_client.quote(ticker)
        
        if not quote or quote.get('c') == 0:
            raise HTTPException(status_code=404, detail=f"Stock data not found for {ticker}")
        
        current_price = quote['c']  # Current price
        change = quote['d']  # Change
        percent_change = quote['dp']  # Percent change
        high = quote['h']  # High price of the day
        low = quote['l']  # Low price of the day
        open_price = quote['o']  # Open price of the day
        previous_close = quote['pc']  # Previous close price
        
        stock_data = StockData(
            ticker=ticker,
            currentPrice=current_price,
            change=change,
            percentChange=percent_change,
            high=high,
            low=low,
            open=open_price,
            previousClose=previous_close
        )
        
        return stock_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching stock data for {ticker}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Search YouTube videos for a stock
@api_router.get("/videos/youtube/{ticker}")
async def search_youtube_videos(ticker: str, max_results: int = 10):
    """Search YouTube for videos related to a stock ticker"""
    try:
        ticker = ticker.upper()
        
        # Get company name
        channel = await db.stock_channels.find_one({"ticker": ticker})
        if not channel:
            raise HTTPException(status_code=404, detail=f"Channel {ticker} not found")
        
        company_name = channel['companyName']
        
        # Search YouTube
        search_query = f"{company_name} {ticker} stock analysis news"
        
        search_response = youtube.search().list(
            q=search_query,
            part='id,snippet',
            maxResults=max_results,
            type='video',
            order='relevance',
            relevanceLanguage='en'
        ).execute()
        
        videos = []
        for item in search_response.get('items', []):
            video_id = item['id']['videoId']
            snippet = item['snippet']
            
            # Determine trust tier based on channel
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
                channelTitle=snippet.get('channelTitle', '')
            )
            videos.append(video)
        
        # Store videos in database
        if videos:
            await db.videos.insert_many([v.dict() for v in videos])
        
        return videos
    except HttpError as e:
        logger.error(f"YouTube API error: {e}")
        raise HTTPException(status_code=500, detail="YouTube API error")
    except Exception as e:
        logger.error(f"Error searching YouTube videos: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Get videos for a channel
@api_router.get("/channels/{ticker}/videos", response_model=List[Video])
async def get_channel_videos(ticker: str):
    """Get all videos for a specific channel"""
    try:
        ticker = ticker.upper()
        
        # Check if videos exist in DB
        videos = await db.videos.find({"stockTicker": ticker}).to_list(100)
        
        # If no videos in DB, fetch from YouTube
        if not videos:
            logger.info(f"No videos found in DB for {ticker}, fetching from YouTube")
            return await search_youtube_videos(ticker)
        
        return [Video(**video) for video in videos]
    except Exception as e:
        logger.error(f"Error fetching videos for {ticker}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Get channel with videos and stock data
@api_router.get("/channels/{ticker}/full")
async def get_channel_full(ticker: str):
    """Get channel with videos and current stock data"""
    try:
        ticker = ticker.upper()
        
        # Get channel
        channel = await db.stock_channels.find_one({"ticker": ticker})
        if not channel:
            raise HTTPException(status_code=404, detail=f"Channel {ticker} not found")
        
        # Get videos
        videos = await db.videos.find({"stockTicker": ticker}).to_list(100)
        if not videos:
            # Fetch from YouTube if none exist
            videos_list = await search_youtube_videos(ticker, max_results=5)
            videos = [v.dict() for v in videos_list]
        
        # Get stock data
        try:
            stock_data = await get_stock_data(ticker)
        except:
            stock_data = None
        
        return {
            "channel": StockChannel(**channel),
            "videos": [Video(**v) for v in videos],
            "currentVideo": Video(**videos[0]) if videos else None,
            "stockData": stock_data
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching full channel data for {ticker}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
    
    # Vetted experts (simplified for MVP)
    expert_keywords = ['cfa', 'analyst', 'investing', 'finance']
    if any(keyword in channel_lower for keyword in expert_keywords):
        return "Vetted Expert"
    
    # Default to Community
    return "Community"


# Root endpoint
@api_router.get("/")
async def root():
    return {"message": "MiltonTV API - Stock Video Streaming Platform"}


# Health check
@api_router.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "finnhub": bool(os.environ.get('FINNHUB_API_KEY')),
        "youtube": bool(os.environ.get('YOUTUBE_API_KEY'))
    }


# Include the router in the main app
app.include_router(api_router)

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

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
