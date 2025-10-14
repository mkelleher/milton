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
  const [isPlaying, setIsPlaying] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [volume, setVolume] = useState(100);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const playerRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const intervalRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const controlsTimeoutRef = useRef(null);

  useEffect(() => {
    initializeApp();
    
    // Cleanup intervals on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
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
    const player = event.target;
    ytPlayerRef.current = player;
    
    // Set initial volume
    player.setVolume(volume);
    
    // Get duration
    const dur = player.getDuration();
    setDuration(dur);
    
    // Clear any existing intervals
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    
    // Monitor video progress and switch before end screen appears
    intervalRef.current = setInterval(() => {
      try {
        if (ytPlayerRef.current && ytPlayerRef.current.getDuration) {
          const duration = ytPlayerRef.current.getDuration();
          const currentTime = ytPlayerRef.current.getCurrentTime();
          const timeRemaining = duration - currentTime;
          
          // Switch to next video 3 seconds before end to avoid overlay
          if (timeRemaining > 0 && timeRemaining < 3) {
            playNextVideo();
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
            }
          }
        }
      } catch (error) {
        // Ignore errors
      }
    }, 500);
    
    // Update progress bar
    progressIntervalRef.current = setInterval(() => {
      try {
        if (ytPlayerRef.current) {
          const currentTime = ytPlayerRef.current.getCurrentTime();
          const duration = ytPlayerRef.current.getDuration();
          setProgress((currentTime / duration) * 100);
          setDuration(duration);
        }
      } catch (error) {
        // Ignore errors
      }
    }, 100);
  };
  
  const playNextVideo = () => {
    const videos = currentChannel ? channelVideos[currentChannel.ticker] || [] : [];
    const currentIndex = videos.findIndex(v => v.videoId === currentVideo?.videoId);
    if (currentIndex !== -1 && videos.length > 0) {
      const nextIndex = (currentIndex + 1) % videos.length;
      setCurrentVideo(videos[nextIndex]);
    }
  };

  const handlePlayPause = () => {
    console.log('Play/Pause clicked, player:', ytPlayerRef.current, 'isPlaying:', isPlaying);
    if (ytPlayerRef.current) {
      try {
        if (isPlaying) {
          ytPlayerRef.current.pauseVideo();
          setIsPlaying(false);
        } else {
          ytPlayerRef.current.playVideo();
          setIsPlaying(true);
        }
      } catch (error) {
        console.error('Error playing/pausing:', error);
      }
    } else {
      console.error('YouTube player not initialized');
    }
  };

  const handleRewind = () => {
    console.log('Rewind clicked');
    if (ytPlayerRef.current) {
      try {
        const currentTime = ytPlayerRef.current.getCurrentTime();
        ytPlayerRef.current.seekTo(Math.max(0, currentTime - 10), true);
      } catch (error) {
        console.error('Error rewinding:', error);
      }
    }
  };

  const handleForward = () => {
    console.log('Forward clicked');
    if (ytPlayerRef.current) {
      try {
        const currentTime = ytPlayerRef.current.getCurrentTime();
        const duration = ytPlayerRef.current.getDuration();
        ytPlayerRef.current.seekTo(Math.min(duration, currentTime + 10), true);
      } catch (error) {
        console.error('Error forwarding:', error);
      }
    }
  };

  const handleVolumeChange = (newVolume) => {
    if (ytPlayerRef.current) {
      ytPlayerRef.current.setVolume(newVolume);
      setVolume(newVolume);
    }
  };

  const handleProgressClick = (e) => {
    if (ytPlayerRef.current && duration > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percentage = clickX / rect.width;
      const newTime = percentage * duration;
      ytPlayerRef.current.seekTo(newTime, true);
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  const handlePlayerStateChange = (event) => {
    // Player states: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)
    if (event.data === 1) {
      setIsPlaying(true);
    } else if (event.data === 2) {
      setIsPlaying(false);
    } else if (event.data === 0) {
      // Video ended - play next immediately (backup to interval check)
      playNextVideo();
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
      controls: 0, // Hide default controls - we'll use custom ones
      modestbranding: 1,
      rel: 0, // Don't show related videos from other channels
      fs: 0, // Disable default fullscreen (we have custom button)
      iv_load_policy: 3, // Hide video annotations
      showinfo: 0, // Don't show video title and uploader before start
      disablekb: 1, // Disable keyboard controls (we'll handle them)
      enablejsapi: 1, // Enable JavaScript API
      origin: window.location.origin, // Set origin for security
      playsinline: 1, // Play inline on mobile
      widget_referrer: window.location.origin,
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
        className="relative bg-black youtube-player-wrapper" 
        style={{ height: '60vh' }}
        data-testid="video-player-container"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setShowControls(false)}
      >
        {currentVideo ? (
          <>
            <YouTube
              key={currentVideo.videoId}
              videoId={currentVideo.videoId}
              opts={opts}
              className="w-full h-full"
              iframeClassName="w-full h-full"
              onReady={handlePlayerReady}
              onStateChange={handlePlayerStateChange}
            />
            
            {/* Physical blocker overlay for bottom portion where overlays appear */}
            <div className="youtube-end-screen-blocker"></div>
            
            {/* Custom Spotify-Style Controls - Always Visible */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/90 to-transparent" style={{ zIndex: 1000 }}>
              {/* Progress Bar */}
              <div className="px-6 pt-4">
                <div 
                  className="h-1 bg-gray-600 rounded-full cursor-pointer group"
                  onClick={handleProgressClick}
                >
                  <div 
                    className="h-full bg-green-500 rounded-full relative transition-all"
                    style={{ width: `${progress}%` }}
                  >
                    <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-between px-6 py-4">
                {/* Left: Video Info */}
                <div className="flex-1 min-w-0 mr-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold text-white ${
                      getTrustTierColor(currentVideo.trustTier)
                    }`}>
                      {currentVideo.trustTier.split(' ')[0]}
                    </span>
                  </div>
                  <h3 className="text-white text-sm font-semibold truncate">{currentVideo.title}</h3>
                  <p className="text-gray-400 text-xs truncate">{currentVideo.channelTitle}</p>
                </div>

                {/* Center: Playback Controls */}
                <div className="flex items-center gap-4">
                  {/* Rewind 10s */}
                  <button
                    onClick={handleRewind}
                    className="text-white hover:text-green-400 transition-colors"
                    title="Rewind 10 seconds"
                  >
                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8zm-1.1 11h-.85v-3.26l-1.01.31v-.69l1.77-.63h.09V16zm4.28-1.76c0 .32-.03.6-.1.82s-.17.42-.29.57-.28.26-.45.33-.37.1-.59.10-.41-.03-.59-.1-.33-.18-.46-.33-.23-.34-.3-.57-.11-.5-.11-.82v-.74c0-.32.03-.6.1-.82s.17-.42.29-.57.28-.26.45-.33.37-.1.59-.1.41.03.59.1.33.18.46.33.23.34.3.57.11.5.11.82v.74zm-.85-.86c0-.19-.01-.35-.04-.48s-.07-.23-.12-.31-.11-.14-.19-.17-.16-.05-.25-.05-.18.02-.25.05-.14.09-.19.17-.09.18-.12.31-.04.29-.04.48v.97c0 .19.01.35.04.48s.07.24.12.32.11.14.19.17.16.05.25.05.18-.02.25-.05.14-.09.19-.17.09-.19.11-.32.04-.29.04-.48v-.97z"/>
                    </svg>
                  </button>

                  {/* Play/Pause */}
                  <button
                    onClick={handlePlayPause}
                    className="w-12 h-12 flex items-center justify-center bg-white rounded-full text-black hover:scale-110 transition-transform"
                    title={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? (
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                      </svg>
                    ) : (
                      <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    )}
                  </button>

                  {/* Forward 10s */}
                  <button
                    onClick={handleForward}
                    className="text-white hover:text-green-400 transition-colors"
                    title="Forward 10 seconds"
                  >
                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18 13c0 3.31-2.69 6-6 6s-6-2.69-6-6 2.69-6 6-6v4l5-5-5-5v4c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8h-2zm-7.46 2.22c0-.19.01-.35.04-.48s.07-.23.12-.31.11-.14.19-.17.16-.05.25-.05.18.02.25.05.14.09.19.17.09.18.11.31.04.29.04.48v.97c0 .19-.01.35-.04.48s-.07.24-.12.32-.11.14-.19.17-.16.05-.25.05-.18-.02-.25-.05-.14-.09-.19-.17-.09-.19-.12-.32-.04-.29-.04-.48v-.97zm3.15.97c0 .32-.03.6-.1.82s-.17.42-.29.57-.28.26-.45.33-.37.1-.59.1-.41-.03-.59-.1-.33-.18-.46-.33-.23-.34-.3-.57-.11-.5-.11-.82v-.74c0-.32.03-.6.1-.82s.17-.42.29-.57.28-.26.45-.33.37-.1.59-.1.41.03.59.1.33.18.46.33.23.34.3.57.11.5.11.82v.74z"/>
                    </svg>
                  </button>
                </div>

                {/* Right: Volume */}
                <div className="flex items-center gap-3 flex-1 justify-end">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                  </svg>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
                    className="w-24 accent-green-500"
                  />
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
                        className={`flex-shrink-0 w-36 rounded-lg overflow-hidden cursor-pointer transition-all hover:scale-105 ${
                          currentVideo?.videoId === video.videoId
                            ? 'ring-4 ring-green-500 shadow-lg shadow-green-500/50'
                            : 'border-2 border-gray-700 hover:border-gray-600'
                        }`}
                        data-testid={`video-card-${video.videoId}`}
                      >
                        {/* Video Thumbnail */}
                        <div className="relative h-20">
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
                        <div className="bg-gray-900 p-1.5">
                          <h4 className="text-white text-xs font-semibold line-clamp-2 mb-0.5">
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
