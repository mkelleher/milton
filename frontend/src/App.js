import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import VideoPlayer from './components/VideoPlayer';
import ChannelGuide from './components/ChannelGuide';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [currentVideos, setCurrentVideos] = useState({});
  const [currentVideo, setCurrentVideo] = useState(null);
  const [stockData, setStockData] = useState(null);
  const [showGuide, setShowGuide] = useState(true);
  const [loading, setLoading] = useState(true);
  const [videoIndex, setVideoIndex] = useState(0);

  // Initialize app
  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      setLoading(true);
      
      // Initialize channels in backend
      await axios.post(`${API}/init-channels`);
      
      // Fetch all channels
      const channelsRes = await axios.get(`${API}/channels`);
      setChannels(channelsRes.data);

      // Auto-select first channel
      if (channelsRes.data.length > 0) {
        handleChannelSelect(channelsRes.data[0]);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error initializing app:', error);
      setLoading(false);
    }
  };

  const handleChannelSelect = useCallback(async (channel) => {
    try {
      setSelectedChannel(channel);
      setVideoIndex(0);

      // Fetch videos for this channel
      const videosRes = await axios.get(`${API}/channels/${channel.ticker}/videos`);
      const videos = videosRes.data;

      // Store videos for this channel
      setCurrentVideos(prev => ({
        ...prev,
        [channel.ticker]: videos[0]
      }));

      // Set first video as current
      if (videos.length > 0) {
        setCurrentVideo(videos[0]);
      }

      // Fetch stock data
      fetchStockData(channel.ticker);

    } catch (error) {
      console.error('Error selecting channel:', error);
    }
  }, []);

  const fetchStockData = async (ticker) => {
    try {
      const stockRes = await axios.get(`${API}/stock/${ticker}`);
      setStockData(stockRes.data);
    } catch (error) {
      console.error('Error fetching stock data:', error);
      setStockData(null);
    }
  };

  const handleVideoEnd = async () => {
    if (!selectedChannel) return;

    try {
      // Fetch more videos if needed
      const videosRes = await axios.get(`${API}/channels/${selectedChannel.ticker}/videos`);
      const videos = videosRes.data;

      // Play next video
      const nextIndex = (videoIndex + 1) % videos.length;
      setVideoIndex(nextIndex);
      setCurrentVideo(videos[nextIndex]);
    } catch (error) {
      console.error('Error loading next video:', error);
    }
  };

  const toggleGuide = useCallback(() => {
    setShowGuide(prev => !prev);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'g' || e.key === 'G') {
        toggleGuide();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [toggleGuide]);

  // Update stock data every 10 seconds
  useEffect(() => {
    if (!selectedChannel) return;

    const interval = setInterval(() => {
      fetchStockData(selectedChannel.ticker);
    }, 10000);

    return () => clearInterval(interval);
  }, [selectedChannel]);

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

  return (
    <div className="App relative h-screen w-screen overflow-hidden bg-black" data-testid="milton-tv-app">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-40 bg-gradient-to-b from-black/80 to-transparent p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold text-white" data-testid="app-title">MiltonTV</h1>
            {selectedChannel && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400">|</span>
                <span className="text-yellow-400 font-semibold">CH. {String(selectedChannel.channelNumber).padStart(3, '0')}</span>
                <span className="text-white">{selectedChannel.companyName}</span>
              </div>
            )}
          </div>
          <button
            onClick={toggleGuide}
            className="px-4 py-2 bg-yellow-400 text-black font-semibold rounded-lg hover:bg-yellow-500 transition-colors"
            data-testid="toggle-guide-btn"
          >
            {showGuide ? 'Close Guide' : 'Channel Guide (G)'}
          </button>
        </div>
      </div>

      {/* Video Player */}
      <VideoPlayer 
        video={currentVideo}
        stockData={stockData}
        onVideoEnd={handleVideoEnd}
      />

      {/* Channel Guide Overlay */}
      {showGuide && (
        <ChannelGuide
          channels={channels}
          selectedChannel={selectedChannel}
          currentVideos={currentVideos}
          onChannelSelect={(channel) => {
            handleChannelSelect(channel);
            setShowGuide(false);
          }}
          onClose={() => setShowGuide(false)}
        />
      )}

      {/* Help Text */}
      {!showGuide && (
        <div className="absolute bottom-6 left-6 text-gray-400 text-sm">
          Press <span className="font-bold text-white">G</span> for Channel Guide
        </div>
      )}
    </div>
  );
}

export default App;
