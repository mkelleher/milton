import React, { useEffect, useRef } from 'react';

const ChannelGuide = ({ channels, selectedChannel, onChannelSelect, onClose, currentVideos }) => {
  const selectedRef = useRef(null);

  useEffect(() => {
    // Scroll to selected channel
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedChannel]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const currentIndex = channels.findIndex(ch => ch.ticker === selectedChannel?.ticker);
        if (currentIndex > 0) {
          onChannelSelect(channels[currentIndex - 1]);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const currentIndex = channels.findIndex(ch => ch.ticker === selectedChannel?.ticker);
        if (currentIndex < channels.length - 1) {
          onChannelSelect(channels[currentIndex + 1]);
        }
      } else if (e.key === 'Enter') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [channels, selectedChannel, onChannelSelect, onClose]);

  const getCurrentVideo = (ticker) => {
    return currentVideos[ticker];
  };

  return (
    <div 
      className="fixed inset-0 bg-black/95 backdrop-blur-sm z-50 overflow-hidden"
      data-testid="channel-guide"
    >
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2" data-testid="guide-title">Channel Guide</h1>
              <p className="text-gray-400">Use arrow keys to navigate • Enter to select • ESC to close</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors p-2"
              data-testid="close-guide-btn"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Channel List */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-900">
          <div className="p-6">
            {channels.map((channel) => {
              const isSelected = selectedChannel?.ticker === channel.ticker;
              const currentVideo = getCurrentVideo(channel.ticker);

              return (
                <div
                  key={channel.id}
                  ref={isSelected ? selectedRef : null}
                  onClick={() => onChannelSelect(channel)}
                  className={`
                    mb-4 p-4 rounded-lg border-2 transition-all cursor-pointer
                    ${isSelected 
                      ? 'border-yellow-400 bg-yellow-400/10 scale-105' 
                      : 'border-gray-700 bg-gray-900/50 hover:border-gray-600 hover:bg-gray-800/50'
                    }
                  `}
                  data-testid={`channel-${channel.ticker}`}
                >
                  <div className="flex items-start gap-4">
                    {/* Channel Number & Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-gray-400 text-sm font-mono">CH. {String(channel.channelNumber).padStart(3, '0')}</span>
                        <span className="text-yellow-400 text-xl font-bold">${channel.ticker}</span>
                      </div>
                      <h3 className="text-white text-lg font-semibold mb-1">{channel.companyName}</h3>
                      
                      {/* Current Video Info */}
                      {currentVideo && (
                        <div className="mt-3 pt-3 border-t border-gray-700">
                          <p className="text-sm text-gray-400 mb-1">Now Playing:</p>
                          <p className="text-white text-sm font-medium line-clamp-2">{currentVideo.title}</p>
                          <p className="text-gray-500 text-xs mt-1">{currentVideo.channelTitle}</p>
                        </div>
                      )}
                    </div>

                    {/* Video Thumbnail */}
                    {currentVideo && (
                      <div className="w-32 h-20 rounded overflow-hidden flex-shrink-0">
                        <img 
                          src={currentVideo.thumbnail} 
                          alt={currentVideo.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChannelGuide;
