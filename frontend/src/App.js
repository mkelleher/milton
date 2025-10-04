import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import YouTube from 'react-youtube';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [channels, setChannels] = useState([]);
  const [channelVideos, setChannelVideos] = useState({});
  const [channelStocks, setChannelStocks] = useState({});
  const [currentVideo, setCurrentVideo] = useState(null);
  const [currentChannel, setCurrentChannel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const playerRef = useRef(null);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      setLoading(true);
      
      // Initialize channels
      await axios.post(`${API}/init-channels`);
      
      // Fetch all channels
      const channelsRes = await axios.get(`${API}/channels`);
      setChannels(channelsRes.data);

      // Load data for all channels
      await Promise.all(channelsRes.data.map(channel => loadChannelData(channel.ticker)));

      // Auto-play first video of first channel
      if (channelsRes.data.length > 0) {
        const firstChannel = channelsRes.data[0];
        setCurrentChannel(firstChannel);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error initializing app:', error);
      setLoading(false);
    }
  };

  const loadChannelData = async (ticker) => {
    try {
      // Fetch videos
      const videosRes = await axios.get(`${API}/channels/${ticker}/videos`);
      setChannelVideos(prev => ({
        ...prev,
        [ticker]: videosRes.data
      }));

      // Set first video as current if none is set
      if (!currentVideo && videosRes.data.length > 0) {
        setCurrentVideo(videosRes.data[0]);
      }

      // Fetch stock data
      const stockRes = await axios.get(`${API}/stock/${ticker}`);
      setChannelStocks(prev => ({
        ...prev,
        [ticker]: stockRes.data
      }));
    } catch (error) {
      console.error(`Error loading data for ${ticker}:`, error);
    }
  };

  const handleVideoClick = (video, channel) => {
    setCurrentVideo(video);
    setCurrentChannel(channel);
  };

  const handleFullscreen = () => {
    if (!isFullscreen) {
      if (playerRef.current?.requestFullscreen) {
        playerRef.current.requestFullscreen();
      } else if (playerRef.current?.webkitRequestFullscreen) {
        playerRef.current.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
    setIsFullscreen(!isFullscreen);
  };

  const handlePlayerReady = (event) => {
    // Hide end screen and suggested videos
    const player = event.target;
    const iframe = player.getIframe();
    if (iframe) {
      // Add CSS to hide overlays
      const style = document.createElement('style');
      style.textContent = `
        .ytp-pause-overlay,
        .ytp-scroll-min,
        .ytp-show-cards-title,
        .ytp-ce-element,
        .ytp-endscreen-content {
          display: none !important;
        }
      `;
      iframe.contentDocument?.head?.appendChild(style);
    }
  };

  const handlePlayerStateChange = (event) => {
    // Player states: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)
    if (event.data === 0) {
      // Video ended - play next video from the channel
      const videos = currentChannel ? channelVideos[currentChannel.ticker] || [] : [];
      const currentIndex = videos.findIndex(v => v.videoId === currentVideo?.videoId);
      if (currentIndex !== -1 && currentIndex < videos.length - 1) {
        // Play next video
        setCurrentVideo(videos[currentIndex + 1]);
      }
    }
  };

  const getTrustTierColor = (tier) => {
    const colors = {
      'Official Company': 'bg-blue-600',
      'Professional News': 'bg-green-600',
      'Vetted Expert': 'bg-purple-600',
      'Community': 'bg-gray-600',
    };
    return colors[tier] || 'bg-gray-600';
  };

  const scrollLeft = (containerId) => {
    const container = document.getElementById(containerId);
    if (container) {
      container.scrollBy({ left: -300, behavior: 'smooth' });
    }
  };

  const scrollRight = (containerId) => {
    const container = document.getElementById(containerId);
    if (container) {
      container.scrollBy({ left: 300, behavior: 'smooth' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-yellow-400 mx-auto mb-4"></div>
          <h2 className="text-white text-2xl font-bold mb-2">MiltonTV</h2>
          <p className="text-gray-400">Loading channels...</p>
        </div>
      </div>
    );
  }

  const opts = {
    height: '100%',
    width: '100%',
    playerVars: {
      autoplay: 1,
      controls: 1,
      modestbranding: 1,
      rel: 0, // Don't show related videos from other channels
      fs: 1, // Allow fullscreen
      iv_load_policy: 3, // Hide video annotations
      showinfo: 0, // Don't show video title and uploader before start
      disablekb: 0, // Enable keyboard controls
      enablejsapi: 1, // Enable JavaScript API
      origin: window.location.origin, // Set origin for security
    },
  };

  const stockData = currentChannel ? channelStocks[currentChannel.ticker] : null;

  return (
    <div className="App h-screen w-screen overflow-hidden bg-black flex flex-col" data-testid="milton-tv-app">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-black z-50">
        <div className="flex items-center gap-8">
          <div>
            <h1 className="text-3xl font-bold text-white" data-testid="app-title">
              milton<span className="text-yellow-400">TV</span>
            </h1>
            <p className="text-xs text-gray-400 mt-0.5 tracking-wide">watch your money</p>
          </div>
          {currentChannel && (
            <div className="flex items-center gap-3">
              <span className="text-gray-400">|</span>
              <span className="text-yellow-400 font-bold text-lg">${currentChannel.ticker}</span>
              <span className="text-white">{currentChannel.companyName}</span>
              {stockData && (
                <div className="flex items-center gap-2 ml-4">
                  <span className="text-white font-bold">${stockData.currentPrice.toFixed(2)}</span>
                  <span className={`text-sm font-semibold ${
                    stockData.change >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {stockData.change >= 0 ? '+' : ''}{stockData.percentChange.toFixed(2)}%
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
        <button
          onClick={handleFullscreen}
          className="px-4 py-2 bg-yellow-400 text-black font-semibold rounded-lg hover:bg-yellow-500 transition-colors flex items-center gap-2"
          data-testid="fullscreen-btn"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
          Fullscreen
        </button>
      </div>

      {/* Video Player */}
      <div 
        ref={playerRef}
        className="relative bg-black" 
        style={{ height: '60vh' }}
        data-testid="video-player-container"
      >
        {currentVideo ? (
          <>
            <YouTube
              videoId={currentVideo.videoId}
              opts={opts}
              className="w-full h-full"
              iframeClassName="w-full h-full"
              onReady={handlePlayerReady}
              onStateChange={handlePlayerStateChange}
            />
            
            {/* Video Info Overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${
                      getTrustTierColor(currentVideo.trustTier)
                    }`}>
                      {currentVideo.trustTier}
                    </span>
                  </div>
                  <h2 className="text-white text-2xl font-bold mb-2">{currentVideo.title}</h2>
                  <p className="text-gray-300 text-sm">{currentVideo.source} • {currentVideo.channelTitle}</p>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-white text-2xl">Select a video to start watching</div>
          </div>
        )}
      </div>

      {/* Channel Guide - Horizontal Scrolling */}
      <div className="flex-1 overflow-y-auto bg-black" data-testid="channel-guide">
        <div className="p-6">
          <h2 className="text-white text-xl font-bold mb-4">Channel Guide</h2>
          
          {/* Each Channel as a Row */}
          {channels.map((channel) => {
            const videos = channelVideos[channel.ticker] || [];
            const stockData = channelStocks[channel.ticker];
            const containerId = `channel-${channel.ticker}`;

            return (
              <div 
                key={channel.id} 
                className="mb-6 border-b border-gray-800 pb-6"
                data-testid={`channel-row-${channel.ticker}`}
              >
                {/* Channel Name on Left */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-48 flex-shrink-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-gray-500 font-mono">CH. {String(channel.channelNumber).padStart(3, '0')}</span>
                      <span className="text-yellow-400 font-bold text-lg">${channel.ticker}</span>
                    </div>
                    <h3 className="text-white font-semibold text-sm">{channel.companyName}</h3>
                    {stockData && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-white text-xs font-bold">${stockData.currentPrice.toFixed(2)}</span>
                        <span className={`text-xs font-semibold ${
                          stockData.change >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {stockData.change >= 0 ? '+' : ''}{stockData.percentChange.toFixed(2)}%
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Horizontal Scroll Controls */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => scrollLeft(containerId)}
                      className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                      aria-label="Scroll left"
                    >
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => scrollRight(containerId)}
                      className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                      aria-label="Scroll right"
                    >
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Horizontal Scrolling Videos */}
                <div 
                  id={containerId}
                  className="flex gap-4 overflow-x-auto scrollbar-thin pb-2"
                  style={{ scrollbarWidth: 'thin' }}
                >
                  {videos.length > 0 ? (
                    videos.map((video) => (
                      <div
                        key={video.id}
                        onClick={() => handleVideoClick(video, channel)}
                        className={`flex-shrink-0 w-48 rounded-lg overflow-hidden cursor-pointer transition-all hover:scale-105 ${
                          currentVideo?.videoId === video.videoId
                            ? 'ring-4 ring-yellow-400'
                            : 'border-2 border-gray-700 hover:border-gray-600'
                        }`}
                        data-testid={`video-card-${video.videoId}`}
                      >
                        {/* Video Thumbnail */}
                        <div className="relative h-28">
                          <img
                            src={video.thumbnail}
                            alt={video.title}
                            className="w-full h-full object-cover"
                          />
                          {/* Trust Tier Badge */}
                          <div className={`absolute top-1 right-1 px-2 py-0.5 rounded text-xs font-semibold text-white ${
                            getTrustTierColor(video.trustTier)
                          }`}>
                            {video.trustTier.split(' ')[0]}
                          </div>
                        </div>
                        
                        {/* Video Info */}
                        <div className="bg-gray-900 p-2">
                          <h4 className="text-white text-xs font-semibold line-clamp-2 mb-1">
                            {video.title}
                          </h4>
                          <p className="text-gray-400 text-xs line-clamp-1">
                            {video.channelTitle}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-gray-500 text-sm py-4">Loading videos...</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default App;
