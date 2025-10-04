import React, { useState, useEffect } from 'react';
import YouTube from 'react-youtube';

const VideoPlayer = ({ video, stockData, onVideoEnd }) => {
  const [showInfo, setShowInfo] = useState(true);
  const [showControls, setShowControls] = useState(false);
  let hideTimeout;

  useEffect(() => {
    // Show info overlay when video changes
    setShowInfo(true);
    const timer = setTimeout(() => setShowInfo(false), 5000);
    return () => clearTimeout(timer);
  }, [video?.videoId]);

  const handleMouseMove = () => {
    setShowControls(true);
    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => setShowControls(false), 3000);
  };

  const opts = {
    height: '100%',
    width: '100%',
    playerVars: {
      autoplay: 1,
      controls: 0,
      modestbranding: 1,
      rel: 0,
    },
  };

  const getTrustTierColor = (tier) => {
    const colors = {
      'Official Company': 'bg-blue-500',
      'Professional News': 'bg-green-500',
      'Vetted Expert': 'bg-purple-500',
      'Community': 'bg-gray-500',
    };
    return colors[tier] || 'bg-gray-500';
  };

  if (!video) {
    return (
      <div className="flex items-center justify-center h-full bg-black" data-testid="video-player-empty">
        <div className="text-white text-2xl">Select a channel to start watching</div>
      </div>
    );
  }

  return (
    <div 
      className="relative h-full w-full bg-black"
      onMouseMove={handleMouseMove}
      data-testid="video-player"
    >
      {/* YouTube Player */}
      <div className="absolute inset-0">
        <YouTube
          videoId={video.videoId}
          opts={opts}
          onEnd={onVideoEnd}
          className="w-full h-full"
          iframeClassName="w-full h-full"
        />
      </div>

      {/* Video Info Overlay */}
      {showInfo && (
        <div 
          className="absolute top-0 left-0 right-0 p-8 bg-gradient-to-b from-black/90 to-transparent transition-opacity duration-500"
          data-testid="video-info-overlay"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-yellow-400 text-lg font-bold" data-testid="stock-ticker">
                  ${video.stockTicker}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${getTrustTierColor(video.trustTier)}`}>
                  {video.trustTier}
                </span>
              </div>
              <h2 className="text-white text-2xl font-bold mb-2" data-testid="video-title">{video.title}</h2>
              <p className="text-gray-300 text-sm" data-testid="video-source">{video.source} • {video.channelTitle}</p>
            </div>
          </div>
        </div>
      )}

      {/* Stock Data Overlay */}
      {stockData && (
        <div 
          className="absolute top-6 right-6 bg-black/80 backdrop-blur-sm rounded-lg p-4 border border-gray-700"
          data-testid="stock-data-overlay"
        >
          <div className="text-white">
            <div className="text-xs text-gray-400 mb-1">{stockData.ticker}</div>
            <div className="text-2xl font-bold mb-1" data-testid="stock-price">${stockData.currentPrice.toFixed(2)}</div>
            <div className={`text-sm font-semibold ${
              stockData.change >= 0 ? 'text-green-400' : 'text-red-400'
            }`} data-testid="stock-change">
              {stockData.change >= 0 ? '+' : ''}{stockData.change.toFixed(2)} ({stockData.percentChange.toFixed(2)}%)
            </div>
          </div>
        </div>
      )}

      {/* Basic Controls (optional) */}
      {showControls && (
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/90 to-transparent">
          <div className="flex items-center justify-center gap-4">
            <p className="text-gray-400 text-sm">Press ESC to view channel guide</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
