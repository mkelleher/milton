import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [channelVideos, setChannelVideos] = useState({});
  const [channelStocks, setChannelStocks] = useState({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('liveTV'); // 'liveTV' or 'onDemand'

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

      // Fetch videos and stock data for first 12 channels
      const firstChannels = channelsRes.data.slice(0, 12);
      await Promise.all(firstChannels.map(channel => loadChannelData(channel.ticker)));

      // Select first channel
      if (channelsRes.data.length > 0) {
        setSelectedChannel(channelsRes.data[0]);
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
        [ticker]: videosRes.data.slice(0, 5)
      }));

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

  const handleChannelClick = async (channel) => {
    setSelectedChannel(channel);
    
    // Load data if not already loaded
    if (!channelVideos[channel.ticker]) {
      await loadChannelData(channel.ticker);
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

  const displayChannels = channels.slice(0, 12);

  return (
    <div className="App h-screen w-screen overflow-hidden bg-black flex flex-col" data-testid="milton-tv-app">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div className="flex items-center gap-8">
          <h1 className="text-3xl font-bold text-white" data-testid="app-title">milton<span className="text-yellow-400">TV</span></h1>
          <div className="flex gap-6">
            <button
              onClick={() => setView('liveTV')}
              className={`text-lg font-semibold transition-colors ${
                view === 'liveTV' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'text-gray-400 hover:text-white'
              }`}
              data-testid="live-tv-btn"
            >
              Live TV
            </button>
            <button
              onClick={() => setView('onDemand')}
              className={`text-lg font-semibold transition-colors ${
                view === 'onDemand' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'text-gray-400 hover:text-white'
              }`}
              data-testid="on-demand-btn"
            >
              On Demand
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Channel List */}
        <div className="w-64 bg-gray-900 border-r border-gray-800 overflow-y-auto scrollbar-thin" data-testid="channel-sidebar">
          <div className="p-4">
            <h2 className="text-yellow-400 text-sm font-bold mb-4 flex items-center gap-2">
              <span className="text-2xl">📊</span>
              <span>Stock Channels</span>
            </h2>
            <div className="space-y-2">
              {displayChannels.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => handleChannelClick(channel)}
                  className={`w-full text-left p-3 rounded-lg transition-all ${
                    selectedChannel?.ticker === channel.ticker
                      ? 'bg-yellow-400 text-black'
                      : 'bg-gray-800 text-white hover:bg-gray-700'
                  }`}
                  data-testid={`sidebar-channel-${channel.ticker}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono opacity-60">CH {String(channel.channelNumber).padStart(2, '0')}</span>
                    <span className="font-bold">${channel.ticker}</span>
                  </div>
                  <div className="text-xs mt-1 truncate opacity-80">
                    {channel.companyName}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main Grid Area */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin" data-testid="channel-grid">
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 max-w-7xl">
            {displayChannels.map((channel) => {
              const isSelected = selectedChannel?.ticker === channel.ticker;
              const videos = channelVideos[channel.ticker] || [];
              const currentVideo = videos[0];
              const stockData = channelStocks[channel.ticker];

              return (
                <div
                  key={channel.id}
                  onClick={() => handleChannelClick(channel)}
                  className={`relative rounded-lg overflow-hidden cursor-pointer transition-all ${
                    isSelected
                      ? 'border-4 border-yellow-400 shadow-2xl shadow-yellow-400/50 scale-105 col-span-1 lg:col-span-2 xl:col-span-2'
                      : 'border-2 border-gray-700 hover:border-gray-600'
                  }`}
                  data-testid={`channel-card-${channel.ticker}`}
                >
                  {/* Channel Thumbnail */}
                  {currentVideo ? (
                    <div className={`relative ${isSelected ? 'h-80' : 'h-48'}`}>
                      <img
                        src={currentVideo.thumbnail}
                        alt={currentVideo.title}
                        className="w-full h-full object-cover"
                      />
                      {/* Channel Logo Overlay */}
                      <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-sm px-3 py-1 rounded-full">
                        <span className="text-yellow-400 font-bold">${channel.ticker}</span>
                      </div>
                      {/* Stock Price Overlay */}
                      {stockData && (
                        <div className="absolute top-3 right-3 bg-black/80 backdrop-blur-sm px-3 py-2 rounded-lg">
                          <div className="text-white text-sm font-bold">${stockData.currentPrice.toFixed(2)}</div>
                          <div className={`text-xs font-semibold ${
                            stockData.change >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {stockData.change >= 0 ? '+' : ''}{stockData.percentChange.toFixed(2)}%
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className={`bg-gray-800 ${isSelected ? 'h-80' : 'h-48'} flex items-center justify-center`}>
                      <div className="text-gray-600 text-4xl font-bold">${channel.ticker}</div>
                    </div>
                  )}

                  {/* Channel Info */}
                  <div className={`bg-gray-900 p-4 ${isSelected ? 'p-6' : ''}`}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className={`font-bold text-white ${
                        isSelected ? 'text-2xl' : 'text-lg'
                      }`}>
                        {channel.companyName}
                      </h3>
                      {currentVideo && (
                        <span className={`px-2 py-1 rounded text-xs font-semibold text-white ${
                          getTrustTierColor(currentVideo.trustTier)
                        }`}>
                          {currentVideo.trustTier}
                        </span>
                      )}
                    </div>

                    {currentVideo && (
                      <div>
                        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
                          <span className="text-yellow-400 font-mono">CH. {String(channel.channelNumber).padStart(3, '0')}</span>
                          <span>•</span>
                          <span>Now Playing</span>
                        </div>
                        <h4 className={`font-semibold text-white mb-2 ${
                          isSelected ? 'text-lg' : 'text-sm line-clamp-2'
                        }`}>
                          {currentVideo.title}
                        </h4>
                        {isSelected && (
                          <div>
                            <p className="text-gray-400 text-sm mb-3 line-clamp-3">
                              {currentVideo.description}
                            </p>
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <span>{currentVideo.channelTitle}</span>
                              <span>•</span>
                              <span>{currentVideo.source}</span>
                            </div>
                            {/* Upcoming Videos */}
                            {videos.length > 1 && (
                              <div className="mt-4 pt-4 border-t border-gray-800">
                                <p className="text-xs text-gray-500 mb-2">Up Next:</p>
                                <div className="grid grid-cols-2 gap-2">
                                  {videos.slice(1, 5).map((video, idx) => (
                                    <div key={video.id} className="flex gap-2 bg-gray-800 p-2 rounded">
                                      <img
                                        src={video.thumbnail}
                                        alt={video.title}
                                        className="w-16 h-12 object-cover rounded"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs text-white font-medium line-clamp-2">
                                          {video.title}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Arrow indicator for selected */}
                  {isSelected && (
                    <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                      <svg className="w-8 h-8 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
