import React, { useState, useEffect, useRef, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  MessageSquare, Users, FolderOpen, History as HistoryIcon, 
  Pen, Type, StickyNote, Image as ImageIcon, Square, Circle, Eraser, Undo, Redo, MousePointer2,
  Sparkles, ListTodo, FileText, CheckSquare, MessageCircle,
  Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, Hand, Settings,
  Link, UserPlus, MoreHorizontal, Maximize2, Trash2, Send, Download, Grid,
  Zap, GripHorizontal, Sun, Moon, X, Key
} from 'lucide-react';
import { wsBaseUrl, apiBaseUrl } from '../config';
import { ThemeContext } from '../App';
import './Room.css';

const Room = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useContext(ThemeContext);
  
  const [activeLeftTab, setActiveLeftTab] = useState('chat');
  const [activeTool, setActiveTool] = useState('pen'); // default to pen drawing
  const [showBrushPanel, setShowBrushPanel] = useState(true);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(true);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isToolbarOpen, setIsToolbarOpen] = useState(true);
  const [toolbarPosition, setToolbarPosition] = useState(null); // start centered
  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);
  const [videoStripPosition, setVideoStripPosition] = useState(null); // start centered
  const [isDraggingVideoStrip, setIsDraggingVideoStrip] = useState(false);
  const [isVideoStripVisible, setIsVideoStripVisible] = useState(true);
  const [laserPaths, setLaserPaths] = useState([]);
  
  // Unread badge states for floating overlays
  const [unreadChats, setUnreadChats] = useState(0);
  const [unreadAi, setUnreadAi] = useState(false);
  
  // Inline text tool states
  const [isTypingText, setIsTypingText] = useState(false);
  const [textInputPosition, setTextInputPosition] = useState({ x: 0, y: 0 });
  const [textInputValue, setTextInputValue] = useState('');
  
  const [ws, setWs] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');
  const [cursors, setCursors] = useState({});
  const [clientId, setClientId] = useState('');
  const [roomUsers, setRoomUsers] = useState(1);
  const [joinError, setJoinError] = useState('');
  
  const [mediaState, setMediaState] = useState({
    mic: false,
    camera: false,
    screen: false
  });

  const [handRaised, setHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState({});
  const [gridType, setGridType] = useState('dotted'); // 'dotted', 'lines', 'none'
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  // Media Refs & States
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);

  // Screen Share Window Refs & States
  const [screenStream, setScreenStream] = useState(null);
  const screenStreamRef = useRef(null);
  useEffect(() => {
    screenStreamRef.current = screenStream;
  }, [screenStream]);
  const [screenPosition, setScreenPosition] = useState({ x: 120, y: 120 });
  const [screenSize, setScreenSize] = useState({ width: 420, height: 260 });
  const [isDraggingScreen, setIsDraggingScreen] = useState(false);
  const screenDragStart = useRef({ x: 0, y: 0 });
  
  const [isResizingScreen, setIsResizingScreen] = useState(false);
  const screenResizeStart = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const localVideoRefCallback = (el) => {
    if (el && localStreamRef.current) {
      el.srcObject = localStreamRef.current;
    }
  };

  const screenVideoRefCallback = (el) => {
    if (el && screenStream) {
      el.srcObject = screenStream;
    }
  };

  // Canvas Whiteboard States
  const [brushColor, setBrushColor] = useState('#818cf8'); // default indigo
  const [brushSize, setBrushSize] = useState(4);
  const [shapeType, setShapeType] = useState('rect'); // rect or circle
  const [drawActions, setDrawActions] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);

  const selectTool = (tool, shape = null) => {
    if (tool === 'pen' || tool === 'eraser' || tool === 'shape' || tool === 'text') {
      if (activeTool === tool && (tool !== 'shape' || shapeType === shape)) {
        // Toggle panel open/close if clicking the same active tool & shape configuration
        setShowBrushPanel(prev => !prev);
      } else {
        // Open panel and set active tool
        setActiveTool(tool);
        setShowBrushPanel(true);
        if (shape) {
          setShapeType(shape);
        }
      }
    } else {
      setActiveTool(tool);
      setShowBrushPanel(false);
    }
  };

  const getToolbarStyle = () => {
    if (!toolbarPosition) {
      return {
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        position: 'absolute'
      };
    }
    return {
      top: `${toolbarPosition.y}px`,
      left: `${toolbarPosition.x}px`,
      transform: 'none',
      position: 'absolute'
    };
  };

  const getBrushPanelStyle = () => {
    if (!toolbarPosition) {
      return {
        top: '75px',
        left: '50%',
        transform: 'translateX(-50%)',
        position: 'absolute'
      };
    }
    return {
      top: `${toolbarPosition.y + 55}px`,
      left: `${toolbarPosition.x}px`,
      transform: 'none',
      position: 'absolute'
    };
  };

  const handleToolbarDragStart = (e) => {
    e.preventDefault();
    const toolbarEl = e.currentTarget.closest('.whiteboard-toolbar');
    if (!toolbarEl) return;
    const rect = toolbarEl.getBoundingClientRect();
    const parentRect = boardRef.current.getBoundingClientRect();
    
    // Convert to absolute coordinates immediately to avoid layout shift conflicts
    const initialX = rect.left - parentRect.left;
    const initialY = rect.top - parentRect.top;
    setToolbarPosition({ x: initialX, y: initialY });
    
    toolbarDragStart.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    setIsDraggingToolbar(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleToolbarDragMove = (e) => {
    if (!isDraggingToolbar || !boardRef.current) return;
    const parentRect = boardRef.current.getBoundingClientRect();
    const toolbarEl = e.currentTarget.closest('.whiteboard-toolbar');
    if (!toolbarEl) return;
    const rect = toolbarEl.getBoundingClientRect();
    
    let newX = e.clientX - parentRect.left - toolbarDragStart.current.x;
    let newY = e.clientY - parentRect.top - toolbarDragStart.current.y;
    
    // Keep within bounds
    newX = Math.max(10, Math.min(newX, parentRect.width - rect.width - 10));
    newY = Math.max(10, Math.min(newY, parentRect.height - rect.height - 10));
    
    setToolbarPosition({ x: newX, y: newY });
  };

  const handleToolbarDragEnd = (e) => {
    if (isDraggingToolbar) {
      setIsDraggingToolbar(false);
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const getVideoStripStyle = () => {
    if (!videoStripPosition) {
      return {
        top: '1rem',
        left: '50%',
        transform: 'translateX(-50%)',
        position: 'absolute'
      };
    }
    return {
      top: `${videoStripPosition.y}px`,
      left: `${videoStripPosition.x}px`,
      position: 'absolute'
    };
  };

  const handleVideoDragStart = (e) => {
    if (e.target.closest('button') || e.target.closest('textarea')) return;
    e.preventDefault();
    const videoStripEl = e.currentTarget.closest('.video-strip');
    if (!videoStripEl) return;
    const rect = videoStripEl.getBoundingClientRect();
    const parentRect = boardRef.current.getBoundingClientRect();
    
    // Convert to absolute coordinates immediately to avoid layout shift conflicts
    const initialX = rect.left - parentRect.left;
    const initialY = rect.top - parentRect.top;
    setVideoStripPosition({ x: initialX, y: initialY });
    
    videoStripDragStart.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    setIsDraggingVideoStrip(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleVideoDragMove = (e) => {
    if (!isDraggingVideoStrip || !boardRef.current) return;
    const parentRect = boardRef.current.getBoundingClientRect();
    const videoStripEl = e.currentTarget.closest('.video-strip');
    if (!videoStripEl) return;
    const rect = videoStripEl.getBoundingClientRect();
    
    let newX = e.clientX - parentRect.left - videoStripDragStart.current.x;
    let newY = e.clientY - parentRect.top - videoStripDragStart.current.y;
    
    // Keep within bounds
    newX = Math.max(10, Math.min(newX, parentRect.width - rect.width - 10));
    newY = Math.max(10, Math.min(newY, parentRect.height - rect.height - 10));
    
    setVideoStripPosition({ x: newX, y: newY });
  };

  const handleVideoDragEnd = (e) => {
    if (isDraggingVideoStrip) {
      setIsDraggingVideoStrip(false);
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  // Sticky Notes States
  const [stickyNotes, setStickyNotes] = useState([]);
  const [draggingNoteId, setDraggingNoteId] = useState(null);

  // AI Chat States
  const [aiMessages, setAiMessages] = useState([
    { role: 'assistant', text: 'Hey there! I am the LiveCollab AI assistant. Draw on the board, drop sticky notes, or type messages, and ask me to summarize the board or generate action checklists!' }
  ]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState(() => {
    return localStorage.getItem('livecollab_gemini_key') || import.meta.env.VITE_GEMINI_API_KEY || '';
  });
  const [tempApiKey, setTempApiKey] = useState('');
  const [showApiKeySetting, setShowApiKeySetting] = useState(false);
  const [hasBackendKey, setHasBackendKey] = useState(false);

  const boardRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const chatBottomRef = useRef(null);
  const aiBottomRef = useRef(null);
  const chatMessagesRef = useRef(null);
  const aiChatHistoryRef = useRef(null);
  const startPointRef = useRef({ x: 0, y: 0 });
  const currentPathRef = useRef([]);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const drawActionsRef = useRef([]);
  
  const toolbarDragStart = useRef({ x: 0, y: 0 });
  const videoStripDragStart = useRef({ x: 0, y: 0 });

  // Sync refs to avoid stale closures in WebSockets onmessage handler
  const isLeftSidebarOpenRef = useRef(isLeftSidebarOpen);
  const activeLeftTabRef = useRef(activeLeftTab);
  const isAiPanelOpenRef = useRef(isAiPanelOpen);

  useEffect(() => {
    isLeftSidebarOpenRef.current = isLeftSidebarOpen;
  }, [isLeftSidebarOpen]);

  useEffect(() => {
    activeLeftTabRef.current = activeLeftTab;
  }, [activeLeftTab]);

  useEffect(() => {
    isAiPanelOpenRef.current = isAiPanelOpen;
  }, [isAiPanelOpen]);

  // Reset unread counts when opening Chat tab
  useEffect(() => {
    if (isLeftSidebarOpen && activeLeftTab === 'chat') {
      setUnreadChats(0);
    }
  }, [isLeftSidebarOpen, activeLeftTab]);

  // Reset unread AI notifications when opening AI panel
  useEffect(() => {
    if (isAiPanelOpen) {
      setUnreadAi(false);
    }
  }, [isAiPanelOpen]);

  useEffect(() => {
    drawActionsRef.current = drawActions;
  }, [drawActions]);

  // Check if backend has Gemini API key configured
  useEffect(() => {
    fetch(`${apiBaseUrl}/api/ai/status`)
      .then(res => res.json())
      .then(data => {
        if (data && typeof data.hasKey === 'boolean') {
          setHasBackendKey(data.hasKey);
        }
      })
      .catch(err => console.warn('Failed to fetch backend AI key status', err));
  }, []);

  // WebSockets Setup
  useEffect(() => {
    if (!roomId) {
      alert('Please enter a room code to join.');
      navigate('/dashboard');
      return;
    }

    const socket = new WebSocket(`${wsBaseUrl}/connect`);
    
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'join', roomId }));
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'joined') {
        setJoinError('');
        setClientId(data.clientId);
        if (data.history && data.history.length > 0) {
          setMessages(data.history);
        }
        if (data.drawActions) {
          setDrawActions(data.drawActions);
          // Wait for canvas to mount and size to redraw
          setTimeout(() => redrawCanvas(data.drawActions), 100);
        }
        if (data.stickyNotes) {
          setStickyNotes(data.stickyNotes);
        }
      } else if (data.type === 'error') {
        setJoinError(data.message || 'Unable to join room');
        alert(data.message || 'Unable to join room');
        navigate('/dashboard');
      } else if (data.type === 'chat') {
        setMessages(prev => [...prev, data]);
        if (!isLeftSidebarOpenRef.current || activeLeftTabRef.current !== 'chat') {
          setUnreadChats(prev => prev + 1);
        }
      } else if (data.type === 'cursor') {
        setCursors(prev => ({
          ...prev,
          [data.senderId]: { x: data.x, y: data.y }
        }));
      } else if (data.type === 'user_joined') {
        setRoomUsers(prev => prev + 1);
        setMessages(prev => [...prev, { type: 'system', text: data.message }]);
      } else if (data.type === 'user_left') {
        setRoomUsers(prev => Math.max(1, prev - 1));
        setMessages(prev => [...prev, { type: 'system', text: `User ${data.clientId.slice(0,4)} left the room` }]);
        
        // Remove left user's cursor
        setCursors(prev => {
          const next = { ...prev };
          delete next[data.clientId];
          return next;
        });
      } else if (data.type === 'laser') {
        setLaserPaths(prev => [
          ...prev.filter(trail => trail.id !== data.senderId),
          { id: data.senderId, points: data.points, timestamp: Date.now() }
        ]);
      } else if (data.type === 'draw') {
        if (data.action) {
          if (data.isPreview) {
            // Live draw preview segment on canvas
            const canvas = canvasRef.current;
            if (canvas) {
              const ctx = canvas.getContext('2d');
              drawActionOnCtx(ctx, data.action);
            }
          } else {
            // Append final action and redraw completely
            setDrawActions(prev => {
              const next = [...prev, data.action];
              redrawCanvas(next);
              return next;
            });
          }
        }
      } else if (data.type === 'clear_board') {
        setDrawActions([]);
        setStickyNotes([]);
        redrawCanvas([]);
      } else if (data.type === 'sticky_create') {
        if (data.note) {
          setStickyNotes(prev => [...prev.filter(n => n.id !== data.note.id), data.note]);
        }
      } else if (data.type === 'sticky_update') {
        setStickyNotes(prev => prev.map(n => {
          if (n.id === data.noteId) {
            return { ...n, ...data.updates };
          }
          return n;
        }));
      } else if (data.type === 'sticky_delete') {
        setStickyNotes(prev => prev.filter(n => n.id !== data.noteId));
      } else if (data.type === 'raise_hand') {
        setRaisedHands(prev => ({ ...prev, [data.senderId]: data.raised }));
        if (data.raised) {
          setMessages(prev => [...prev, { type: 'system', text: `User ${data.senderId.slice(0, 4)} raised their hand ✋` }]);
        }
      }
    };

    socket.onerror = () => {
      setJoinError('Connection error. Please try again.');
    };

    setWs(socket);

    return () => socket.close();
  }, [roomId, navigate]);

  // Handle Resize and Initial Canvas Setup (Optimized to prevent flickering)
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const overlayCanvas = overlayCanvasRef.current;
      if (canvas && boardRef.current) {
        const rect = boardRef.current.getBoundingClientRect();
        const targetWidth = Math.floor(rect.width);
        const targetHeight = Math.floor(rect.height);
        
        // Only set width and height if the size has actually changed.
        // This avoids clearing the canvas context and flickering on draw updates.
        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          redrawCanvas(drawActionsRef.current);
        }
        if (overlayCanvas && (overlayCanvas.width !== targetWidth || overlayCanvas.height !== targetHeight)) {
          overlayCanvas.width = targetWidth;
          overlayCanvas.height = targetHeight;
          redrawOverlayCanvas();
        }
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    // Extra timeout setup to capture delayed flex mounts
    const t = setTimeout(handleResize, 300);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(t);
    };
  }, [isLeftSidebarOpen, isAiPanelOpen]);

  // Cleanup WebRTC camera/mic and screen sharing streams on unmount to prevent leaks
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Handle laser trails fading out
  useEffect(() => {
    if (laserPaths.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const activeTrails = laserPaths.filter(trail => now - trail.timestamp < 1500);
      if (activeTrails.length !== laserPaths.length) {
        setLaserPaths(activeTrails);
        redrawOverlayCanvas();
      } else if (activeTrails.length > 0) {
        redrawOverlayCanvas();
      }
    }, 50);
    return () => clearInterval(interval);
  }, [laserPaths]);

  // Auto-scroll chats without parent page jump
  useEffect(() => {
    const container = chatMessagesRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  // Auto-scroll AI logs without parent page jump
  useEffect(() => {
    const container = aiChatHistoryRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [aiMessages]);

  // Drawing functions
  const drawActionOnCtx = (ctx, action) => {
    if (!action) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = action.color;
    ctx.lineWidth = action.size;

    if (action.tool === 'text') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.font = `bold ${action.size * 3 + 12}px Inter, sans-serif`;
      ctx.fillStyle = action.color;
      ctx.fillText(action.text, action.x, action.y);
    } else if (action.tool === 'pen' || action.tool === 'eraser') {
      if (action.tool === 'eraser') {
        // Destination-out clears canvas pixels
        ctx.globalCompositeOperation = 'destination-out';
      } else {
        ctx.globalCompositeOperation = 'source-over';
      }

      ctx.beginPath();
      const points = action.points || [];
      if (points.length > 0) {
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    } else if (action.tool === 'shape') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      if (action.shapeType === 'rect') {
        ctx.rect(action.x, action.y, action.width, action.height);
      } else if (action.shapeType === 'circle') {
        ctx.arc(
          action.x + action.width / 2,
          action.y + action.height / 2,
          Math.abs(action.width) / 2,
          0,
          2 * Math.PI
        );
      }
      ctx.stroke();
    }
  };

  const redrawCanvas = (actionsList) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    actionsList.forEach(action => {
      drawActionOnCtx(ctx, action);
    });
  };

  const redrawOverlayCanvas = (currentDrawingAction = null) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (currentDrawingAction) {
      drawActionOnCtx(ctx, currentDrawingAction);
    }

    // Draw active laser pointer trails
    laserPaths.forEach(trail => {
      const age = Date.now() - trail.timestamp;
      if (age > 1500) return;
      const alpha = 1 - age / 1500;
      ctx.strokeStyle = `rgba(239, 68, 68, ${alpha})`;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const points = trail.points || [];
      if (points.length > 0) {
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();
      }
    });
  };

  // Canvas Handlers
  const handleMouseDownCanvas = (e) => {
    if (activeTool === 'cursor') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDrawing(true);
    startPointRef.current = { x, y };

    if (activeTool === 'pen' || activeTool === 'eraser') {
      currentPathRef.current = [{ x, y }];
    } else if (activeTool === 'text') {
      setTextInputPosition({ x, y });
      setIsTypingText(true);
      setTextInputValue('');
      setIsDrawing(false);
    } else if (activeTool === 'laser') {
      currentPathRef.current = [{ x, y }];
      setLaserPaths(prev => [
        ...prev.filter(trail => trail.id !== 'local'),
        { id: 'local', points: [{ x, y }], timestamp: Date.now() }
      ]);
    }
  };

  const handleMouseMoveCanvas = (e) => {
    // Sync remote cursor coordinates
    if (ws && ws.readyState === WebSocket.OPEN && boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      ws.send(JSON.stringify({ type: 'cursor', x, y, roomId }));
    }

    if (!isDrawing || activeTool === 'cursor') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (activeTool === 'laser') {
      const newPoint = { x, y };
      currentPathRef.current.push(newPoint);
      setLaserPaths(prev => [
        ...prev.filter(trail => trail.id !== 'local'),
        { id: 'local', points: [...currentPathRef.current], timestamp: Date.now() }
      ]);
      redrawOverlayCanvas();
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'laser',
          points: currentPathRef.current,
          roomId
        }));
      }
    } else if (activeTool === 'pen' || activeTool === 'eraser') {
      const prevPoint = currentPathRef.current[currentPathRef.current.length - 1];
      const newPoint = { x, y };
      currentPathRef.current.push(newPoint);

      // Render local segment directly on bottom canvas for maximum speed
      const action = {
        tool: activeTool,
        points: [prevPoint, newPoint],
        color: activeTool === 'eraser' ? '#000' : brushColor,
        size: brushSize
      };
      drawActionOnCtx(ctx, action);

      // Sync preview to peer clients
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'draw',
          action,
          isPreview: true,
          roomId
        }));
      }
    } else if (activeTool === 'shape') {
      const width = x - startPointRef.current.x;
      const height = y - startPointRef.current.y;
      const previewAction = {
        tool: 'shape',
        shapeType,
        x: startPointRef.current.x,
        y: startPointRef.current.y,
        width,
        height,
        color: brushColor,
        size: brushSize
      };
      redrawOverlayCanvas(previewAction);
    }
  };

  const handleMouseUpCanvas = (e) => {
    if (!isDrawing || activeTool === 'cursor') return;
    setIsDrawing(false);

    if (activeTool === 'laser') {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let finalAction = null;

    if (activeTool === 'pen' || activeTool === 'eraser') {
      finalAction = {
        tool: activeTool,
        points: currentPathRef.current,
        color: activeTool === 'eraser' ? '#000' : brushColor,
        size: brushSize
      };
    } else if (activeTool === 'shape') {
      const width = x - startPointRef.current.x;
      const height = y - startPointRef.current.y;
      finalAction = {
        tool: 'shape',
        shapeType,
        x: startPointRef.current.x,
        y: startPointRef.current.y,
        width,
        height,
        color: brushColor,
        size: brushSize
      };
    }

    if (finalAction) {
      setDrawActions(prev => {
        const next = [...prev, finalAction];
        redrawCanvas(next);
        return next;
      });
      redrawOverlayCanvas(null); // Clear shape preview from top canvas

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'draw',
          action: finalAction,
          isPreview: false,
          roomId
        }));
      }
    }
  };

  const clearWhiteboard = () => {
    if (window.confirm('Are you sure you want to clear the collaborative whiteboard?')) {
      setDrawActions([]);
      setStickyNotes([]);
      redrawCanvas([]);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'clear_board', roomId }));
      }
    }
  };

  // Sticky Notes logic
  const createStickyNote = (colorName = 'yellow') => {
    const bgColors = {
      yellow: '#fef08a',
      pink: '#fbcfe8',
      blue: '#93c5fd',
      green: '#86efac'
    };
    
    const newNote = {
      id: Math.random().toString(36).substring(2, 10),
      x: 200 + Math.random() * 200,
      y: 150 + Math.random() * 150,
      text: '',
      color: bgColors[colorName] || '#fef08a',
      colorName
    };

    setStickyNotes(prev => [...prev, newNote]);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'sticky_create', note: newNote, roomId }));
    }
  };

  const handleStickyPointerDown = (e, noteId) => {
    if (activeTool !== 'cursor') return;
    if (e.target.tagName.toLowerCase() === 'textarea' || e.target.closest('.delete-note-btn')) return;
    
    setDraggingNoteId(noteId);
    const note = stickyNotes.find(n => n.id === noteId);
    if (note) {
      dragOffsetRef.current = {
        x: e.clientX - note.x,
        y: e.clientY - note.y
      };
    }
    e.target.setPointerCapture(e.pointerId);
  };

  const handleStickyPointerMove = (e, noteId) => {
    if (draggingNoteId !== noteId) return;
    const newX = e.clientX - dragOffsetRef.current.x;
    const newY = e.clientY - dragOffsetRef.current.y;
    
    setStickyNotes(prev => prev.map(note => {
      if (note.id === noteId) {
        const updated = { ...note, x: newX, y: newY };
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'sticky_update',
            noteId,
            updates: { x: newX, y: newY },
            roomId
          }));
        }
        return updated;
      }
      return note;
    }));
  };

  const handleStickyPointerUp = (e, noteId) => {
    if (draggingNoteId === noteId) {
      setDraggingNoteId(null);
      e.target.releasePointerCapture(e.pointerId);
    }
  };

  const handleStickyTextChange = (noteId, newText) => {
    setStickyNotes(prev => prev.map(note => {
      if (note.id === noteId) {
        const updated = { ...note, text: newText };
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'sticky_update',
            noteId,
            updates: { text: newText },
            roomId
          }));
        }
        return updated;
      }
      return note;
    }));
  };

  const deleteStickyNote = (noteId) => {
    setStickyNotes(prev => prev.filter(note => note.id !== noteId));
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'sticky_delete', noteId, roomId }));
    }
  };

  // AI assistant handlers (Enhanced with dynamic board awareness and Gemini API integration)
  const simulateAiResponse = async (promptType) => {
    setIsAiLoading(true);
    let fullText = '';
    
    const notesCount = stickyNotes.length;
    const drawingsCount = drawActions.length;
    const chatMsgCount = messages.filter(m => m.type === 'chat').length;
    const stickyTexts = stickyNotes.map(n => n.text).filter(t => t.trim().length > 0);
    
    const lowerPrompt = promptType.toLowerCase();

    let systemContext = `You are the LiveCollab AI Assistant, a helpful workspace partner integrated into a collaborative whiteboard room (Room ID: "${roomId}").
    You have access to the current state of the board:
    - Drawings: ${drawingsCount} sketches/shapes drawn on the canvas.
    - Sticky Notes: ${notesCount} active stickies. Content of stickies: ${JSON.stringify(stickyTexts)}.
    - Recent chat logs: ${JSON.stringify(messages.filter(m => m.type === 'chat').slice(-10).map(m => m.text))}.

    The user may ask you to summarize the board, extract tasks/todos, create meeting notes, or ask any general question (just like general Gemini AI).
    Use clear, beautiful markdown formatting. Keep your tone professional, collaborative, and friendly.`;

    let prompt = promptType;
    if (promptType === 'summary') {
      prompt = 'Please summarize the current state of our whiteboard room and active discussions.';
    } else if (promptType === 'tasks') {
      prompt = 'Please extract action items and checklist tasks from the sticky notes in this whiteboard room.';
    } else if (promptType === 'notes') {
      prompt = 'Please generate meeting minutes and notes from our whiteboard room, detailing discussions and next steps.';
    }

    if (geminiApiKey) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: `${systemContext}\n\nUser Question: ${prompt}` }
                ]
              }
            ]
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `HTTP ${res.status}`);
        }

        const data = await res.json();
        fullText = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response text received from Gemini.';
      } catch (err) {
        console.error('Gemini API Error:', err);
        fullText = `### Gemini API Error ⚠️\n\nFailed to get a response from Gemini AI. Please check your API key and network connection.\n\n**Details**: ${err.message}`;
      }
    } else {
      try {
        const res = await fetch(`${apiBaseUrl}/api/ai`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            prompt: `${systemContext}\n\nUser Question: ${prompt}`
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        fullText = data.text;
      } catch (backendErr) {
        console.warn('Backend AI proxy failed or was unconfigured.', backendErr);
        if (hasBackendKey) {
          fullText = `### Gemini API Proxy Error ⚠️\n\nThe backend AI proxy returned an error. This usually indicates that the environment variable on Render is invalid, expired, or has an incorrect name.\n\n**Details**: ${backendErr.message}`;
        } else {
          // Running local simulation fallback
          if (promptType === 'summary' || lowerPrompt.includes('summary') || lowerPrompt.includes('summarize') || lowerPrompt.includes('board')) {
            fullText = `### LiveCollab Workspace Summary 📊\n\nI have scanned the active canvas, sticky elements, and team chat:\n* **Whiteboard Details**: Detected **${drawingsCount} sketches/shapes** drawn on the board.\n* **Sticky Workspace**: Identified **${notesCount} active sticky notes**.\n* **Collaboration Hub**: Exchanged **${chatMsgCount} team chat logs** in this room.\n\n#### Key Focus Areas:\n1. **Dynamic Whiteboarding**: Concentration of visual sketches suggests active mockup layout iteration.\n2. **Draggable Tasks**: Sticky elements map structural dependencies. ${stickyTexts.length > 0 ? `The team is discussing: ${stickyTexts.map(t => `"${t}"`).join(', ')}.` : 'No custom tasks written on stickies yet.'}`;
          } else if (promptType === 'tasks' || lowerPrompt.includes('task') || lowerPrompt.includes('todo') || lowerPrompt.includes('checklist')) {
            const extracted = stickyNotes
              .map((n, i) => `  ${i + 1}. **Sticky Task [${n.colorName.toUpperCase()}]**: "${n.text.substring(0, 50)}${n.text.length > 50 ? '...' : ''}"`)
              .join('\n');
            
            fullText = `### Automated Task Extraction 📋\n\nHere is your team's checklist built directly from active sticky notes:\n\n${extracted || '  1. **Default Action**: Initialize whiteboard designs.\n  2. **WS Test**: Open multi-window sync validation.\n  3. **Interface check**: Verify light/dark style parameters.'}\n\n*You can copy this list directly into your planning issues.*`;
          } else if (promptType === 'notes' || lowerPrompt.includes('note') || lowerPrompt.includes('meeting')) {
            fullText = `### Automated Meeting Notes 📝\n* **Workspace ID**: Room \`${roomId}\`\n* **Active Collab Users**: ${roomUsers} member(s)\n* **Technical Decisions**: Database fallback handles ENOTFOUND/timeout DNS conditions with in-memory fallback buffers.\n\n**Next Action Items**:\n${stickyTexts.length > 0 ? stickyTexts.map(t => `- Follow up on: "${t}"`).join('\n') : '- Standardize responsive styling variables.\n- Polish Outfit theme selectors.'}`;
          } else {
            // Check for general knowledge questions
            if (lowerPrompt.includes('photosynthesis') || lowerPrompt.includes('photo synthesis')) {
              fullText = `### Photosynthesis 🌿\n\nPhotosynthesis is the chemical process by which green plants, algae, and some bacteria convert light energy (usually from the Sun) into chemical energy (glucose), using carbon dioxide and water.\n\n#### The Chemical Formula:\n\`\`\`\n6CO₂ (Carbon Dioxide) + 6H₂O (Water) + Light Energy ➔ C₆H₁₂O₆ (Glucose) + 6O₂ (Oxygen)\n\`\`\`\n\n#### Key Process Steps:\n1. **Light Absorption**: Chlorophyll inside plant chloroplasts captures solar energy.\n2. **Water Splitting**: Water molecules absorbed by roots are split into oxygen gas and hydrogen ions.\n3. **Carbon Fixation**: Carbon dioxide from the air is processed to form sugars (glucose).\n\nThis process is fundamental to life on Earth as it releases Oxygen (O₂) as a byproduct and serves as the primary energy source for nearly all food chains.`;
            } else if (lowerPrompt.includes('gravity') || lowerPrompt.includes('gravitation')) {
              fullText = `### Gravity 🌌\n\nGravity is a fundamental force of attraction that acts between all objects with mass. The more mass an object has, and the closer it is, the stronger its gravitational pull.\n\n#### Key Milestones:\n* **Sir Isaac Newton (1687)**: Formulated the Law of Universal Gravitation, stating that every mass exerts an attractive force on every other mass.\n* **Albert Einstein (1915)**: Described gravity not as a direct force, but as a curvature of spacetime caused by mass and energy (Theory of General Relativity).\n\nWithout gravity, planets could not orbit the sun, and the atmosphere, oceans, and life could not remain bound to Earth.`;
            } else if (lowerPrompt.includes('javascript') || lowerPrompt.includes(' js')) {
              fullText = `### JavaScript (JS) 💻\n\nJavaScript is a high-level, dynamic, single-threaded, and interpreted programming language that conforms to the ECMAScript specification.\n\n#### Core Concepts:\n* **Prototypes**: Objects inherit properties directly from other template objects.\n* **Asynchronous Event Loop**: Handles non-blocking execution using callbacks, promises, and async/await.\n* **First-Class Functions**: Functions can be passed as arguments, returned, and assigned to variables.`;
            } else if (lowerPrompt.includes('react')) {
              fullText = `### ReactJS ⚛️\n\nReact is a declarative, component-based JavaScript library for building interactive user interfaces, maintained by Meta and a large developer community.\n\n#### Key Features:\n1. **JSX**: A syntax extension that allows writing HTML elements inside JavaScript.\n2. **Virtual DOM**: React keeps a lightweight representation of the UI in memory, batch-updating only the modified elements to improve rendering speed.\n3. **Component Lifecycle & Hooks**: Hooks (like \`useState\`, \`useEffect\`) allow functional components to manage local state and side effects.`;
            } else if (lowerPrompt.includes('who are you') || lowerPrompt.includes('what are you') || lowerPrompt.includes('your name')) {
              fullText = `I am the **LiveCollab AI Assistant**, a smart workspace agent built to help teams brainstorm, write, design, and plan projects in real-time.\n\n#### What I Can Do:\n1. **Analyze Whiteboard**: Summarize drawing lines and shapes on the canvas.\n2. **Extract Tasks**: Scan your sticky notes and compile them into action checklists.\n3. **General Knowledge**: Answer general questions regarding science, math, history, coding, and design.\n4. **Meeting Minutes**: Generate notes and logs from the current session.`;
            } else if (lowerPrompt.startsWith('what') || lowerPrompt.startsWith('how') || lowerPrompt.startsWith('why') || lowerPrompt.startsWith('explain') || lowerPrompt.startsWith('who') || lowerPrompt.includes('?') || lowerPrompt.length > 15) {
              // General question fallback template
              fullText = `### Workspace Brainstorming: ${promptType} 🧠\n\nHere is a conceptual analysis for your query: **"${promptType}"**.\n\n#### 1. Contextual Definition\nThe topic **"${promptType}"** refers to a core domain subject. In collaborative design, breaking this down into modular steps enables team members to build shared understanding.\n\n#### 2. Key Considerations\n* **Research**: Gather structural facts and references to validate assumptions.\n* **Design**: Draw block diagrams on this whiteboard to outline flows or architectures.\n* **Tasks**: Drop sticky notes to assign specific follow-up actions to collaborators.\n\nWould you like me to generate a checklist of tasks or compile whiteboard session notes related to this topic?`;
            } else {
              // Context-aware board response
              if (stickyTexts.length > 0) {
                fullText = `I have analyzed the active workspace regarding your query: "${promptType}". Based on the sticky notes (${stickyTexts.map(t => `"${t}"`).join(', ')}):\n\n* **Discussion Theme**: It looks like you are collaborating on these items.\n* **Drawing Stats**: There are also ${drawingsCount} drawing lines or shapes on the canvas.\n\nWould you like me to compile notes, checklists, or summaries from these elements?`;
              } else {
                fullText = `I scanned the board for "${promptType}" but it is currently empty. Please drop some sticky notes or draw on the whiteboard, then ask me to summarize, extract tasks, or draft meeting notes!`;
              }
            }
          }
        }
      }
    }

    setAiMessages(prev => [...prev, { role: 'assistant', text: '' }]);
    
    let currentText = '';
    let charIndex = 0;
    const interval = setInterval(() => {
      if (charIndex < fullText.length) {
        currentText += fullText.substring(charIndex, charIndex + 4);
        setAiMessages(prev => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', text: currentText };
          return next;
        });
        charIndex += 4;
      } else {
        clearInterval(interval);
        setIsAiLoading(false);
        // If the AI panel is closed, trigger unread badge notification
        if (!isAiPanelOpenRef.current) {
          setUnreadAi(true);
        }
      }
    }, 15);
  };

  const handleAiSend = (e) => {
    e.preventDefault();
    if (!aiInput.trim()) return;
    const userMsg = aiInput.trim();
    setAiInput('');
    setAiMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    
    setTimeout(() => {
      simulateAiResponse(userMsg);
    }, 500);
  };

  // Text Chat handler
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (inputMsg.trim() && ws) {
      const msg = { type: 'chat', text: inputMsg, roomId };
      ws.send(JSON.stringify(msg));
      setMessages(prev => [...prev, { ...msg, senderId: clientId }]);
      setInputMsg('');
    }
  };

  const initMediaStream = async (audioEnabled, videoEnabled) => {
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
      });
      
      localStreamRef.current = stream;
      stream.getAudioTracks().forEach(t => t.enabled = audioEnabled);
      stream.getVideoTracks().forEach(t => t.enabled = videoEnabled);
      
      setHasCameraPermission(true);
    } catch (err) {
      console.warn("Could not access camera/mic:", err);
      setHasCameraPermission(false);
      setMediaState(prev => ({ ...prev, camera: false, mic: false }));
    }
  };

  const stopLocalStream = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    setHasCameraPermission(false);
  };

  const toggleMedia = async (type) => {
    if (type === 'mic') {
      const nextMicState = !mediaState.mic;
      setMediaState(prev => ({ ...prev, mic: nextMicState }));
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(t => t.enabled = nextMicState);
      } else if (nextMicState) {
        await initMediaStream(nextMicState, mediaState.camera);
      }
    } else if (type === 'camera') {
      const nextCamState = !mediaState.camera;
      setMediaState(prev => ({ ...prev, camera: nextCamState }));
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach(t => t.enabled = nextCamState);
        if (!nextCamState && !mediaState.mic) {
          stopLocalStream();
        }
      } else if (nextCamState) {
        await initMediaStream(mediaState.mic, nextCamState);
      }
    } else if (type === 'screen') {
      if (mediaState.screen) {
        stopScreenShare();
      } else {
        await startScreenShare();
      }
    }
  };

  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      setScreenStream(stream);
      setMediaState(prev => ({ ...prev, screen: true }));
      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };
    } catch (err) {
      console.warn("Screen sharing failed:", err);
      setMediaState(prev => ({ ...prev, screen: false }));
    }
  };

  const stopScreenShare = () => {
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
      setScreenStream(null);
    }
    setMediaState(prev => ({ ...prev, screen: false }));
  };

  // Draggable Screen Share Window Handlers
  const handleScreenDragStart = (e) => {
    e.preventDefault();
    setIsDraggingScreen(true);
    screenDragStart.current = {
      x: e.clientX - screenPosition.x,
      y: e.clientY - screenPosition.y
    };
    e.target.setPointerCapture(e.pointerId);
  };

  const handleScreenDragMove = (e) => {
    if (!isDraggingScreen) return;
    const newX = e.clientX - screenDragStart.current.x;
    const newY = e.clientY - screenDragStart.current.y;
    setScreenPosition({ x: newX, y: newY });
  };

  const handleScreenDragEnd = (e) => {
    setIsDraggingScreen(false);
  };

  const handleScreenResizeStart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingScreen(true);
    screenResizeStart.current = {
      x: e.clientX,
      y: e.clientY,
      width: screenSize.width,
      height: screenSize.height
    };
    e.target.setPointerCapture(e.pointerId);
  };

  const handleScreenResizeMove = (e) => {
    if (!isResizingScreen) return;
    const deltaX = e.clientX - screenResizeStart.current.x;
    const deltaY = e.clientY - screenResizeStart.current.y;
    setScreenSize({
      width: Math.max(200, screenResizeStart.current.width + deltaX),
      height: Math.max(150, screenResizeStart.current.height + deltaY)
    });
  };

  const handleScreenResizeEnd = (e) => {
    setIsResizingScreen(false);
  };

  // Raise Hand Handler
  const toggleRaiseHand = () => {
    const nextState = !handRaised;
    setHandRaised(nextState);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'raise_hand', raised: nextState, roomId }));
    }
  };

  // Offscreen draw helpers for export
  const drawDottedGrid = (canvas, ctx) => {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    const size = 20;
    for (let x = 0; x < canvas.width; x += size) {
      for (let y = 0; y < canvas.height; y += size) {
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  };

  const drawLinesGrid = (canvas, ctx) => {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    const size = 20;
    for (let x = 0; x < canvas.width; x += size) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += size) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  };

  // Export board as PNG
  const exportBoardAsPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const exportCtx = exportCanvas.getContext('2d');
    
    // Background Slate
    exportCtx.fillStyle = '#0b0f19'; // clean dark editor slate color
    exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    
    if (gridType === 'dotted') {
      drawDottedGrid(exportCanvas, exportCtx);
    } else if (gridType === 'lines') {
      drawLinesGrid(exportCanvas, exportCtx);
    }
    
    // Copy main drawings
    exportCtx.drawImage(canvas, 0, 0);
    
    const link = document.createElement('a');
    link.download = `livecollab-board-${roomId}-${Date.now()}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
    setIsMoreMenuOpen(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopLocalStream();
      stopScreenShare();
    };
  }, []);

  const copyRoomLink = () => {
    navigator.clipboard.writeText(window.location.href);
    alert('Room link copied to clipboard!');
  };

  return (
    <div className="room-layout">
      {/* Top Bar */}
      <header className="glass room-top-bar">
        <div className="room-info" style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <img 
            src="/logo.png" 
            alt="LiveCollab" 
            style={{ 
              height: '32px', 
              width: 'auto', 
              backgroundColor: theme === 'dark' ? '#ffffff' : 'transparent', 
              padding: '4px', 
              borderRadius: '8px', 
              boxShadow: theme === 'dark' ? '0 2px 8px rgba(0, 0, 0, 0.2)' : 'none',
              objectFit: 'contain'
            }} 
          />
          <div className="room-title">
            <h2 className="text-gradient">Board: {roomId}</h2>
            <span className="live-badge">LIVE</span>
          </div>
          {joinError && <p className="text-secondary text-sm">{joinError}</p>}
        </div>
        
        <div className="room-actions">
          <div className="facepile">
            <div className="avatar extra-count active-speaker">ME</div>
            {roomUsers > 1 && <div className="avatar extra-count">U1</div>}
            {roomUsers > 2 && <div className="avatar extra-count">U2</div>}
            {roomUsers > 3 && <div className="avatar extra-count">+{roomUsers - 3}</div>}
          </div>
          
          <button className="btn-secondary btn-sm" onClick={copyRoomLink} style={{ padding: '0.4rem 0.8rem' }}>
            <Link size={16} style={{marginRight:'0.3rem'}}/> Link
          </button>
          <button className="btn-primary btn-sm flex-center" onClick={copyRoomLink}>
            <UserPlus size={16} style={{ marginRight: '0.4rem' }} /> Invite
          </button>
          <button className="btn-danger btn-sm" onClick={() => navigate('/dashboard')}>End Session</button>
        </div>
      </header>

      {/* Main Grid Layout */}
      <div className="room-body">
        
        {/* Left Sidebar */}
        {isLeftSidebarOpen && (
          <aside className="glass-panel left-sidebar">
          <div className="sidebar-tabs">
            <button title="Group Chat" className={`tab-btn ${activeLeftTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveLeftTab('chat')}>
              <MessageSquare size={20} />
            </button>
            <button title="Users List" className={`tab-btn ${activeLeftTab === 'users' ? 'active' : ''}`} onClick={() => setActiveLeftTab('users')}>
              <Users size={20} />
            </button>
            <button title="Files Locker" className={`tab-btn ${activeLeftTab === 'files' ? 'active' : ''}`} onClick={() => setActiveLeftTab('files')}>
              <FolderOpen size={20} />
            </button>
            <button title="Board Sessions" className={`tab-btn ${activeLeftTab === 'history' ? 'active' : ''}`} onClick={() => setActiveLeftTab('history')}>
              <HistoryIcon size={20} />
            </button>
          </div>
          
          <div className="sidebar-content">
            {activeLeftTab === 'chat' && (
              <div className="chat-container">
                <div className="chat-messages" ref={chatMessagesRef}>
                  <div className="message system">Welcome to {roomId}</div>
                  {messages.map((m, i) => (
                    <div key={i} className={`message ${m.type === 'system' ? 'system' : (m.senderId === clientId ? 'me' : 'other')}`}>
                      {m.type !== 'system' && m.senderId !== clientId && <span className="sender-name">User {m.senderId.slice(0, 4)}</span>}
                      {m.type === 'system' ? m.text : <div className="bubble">{m.text}</div>}
                    </div>
                  ))}
                  <div ref={chatBottomRef} />
                </div>
                <form onSubmit={handleSendMessage} className="chat-input-area">
                  <div className="input-group">
                    <input 
                      type="text" 
                      value={inputMsg} 
                      onChange={e => setInputMsg(e.target.value)} 
                      placeholder="Type a message..." 
                      className="input-glass"
                    />
                    <button type="submit" className="btn-send"><Send size={16} /></button>
                  </div>
                </form>
              </div>
            )}
            {activeLeftTab === 'users' && (
              <div className="users-tab-content">
                <div className="user-item-row">
                  <div className="avatar me-avatar">ME</div>
                  <div className="user-details">
                    <span className="user-name">You (Developer)</span>
                    <span className="user-badge-status">Host</span>
                  </div>
                </div>
                {roomUsers > 1 && [...Array(roomUsers - 1)].map((_, i) => (
                  <div key={i} className="user-item-row">
                    <div className="avatar other-avatar">U{i+1}</div>
                    <div className="user-details">
                      <span className="user-name">Collaborator {i + 1}</span>
                      <span className="user-badge-status online">Connected</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {activeLeftTab !== 'chat' && activeLeftTab !== 'users' && (
              <div className="empty-state" style={{flex: 1, padding: '2rem'}}>
                <div className="empty-icon-wrap" style={{width: '48px', height: '48px', marginBottom: '1rem'}}>
                  {activeLeftTab === 'files' && <FolderOpen size={24} className="text-secondary" />}
                  {activeLeftTab === 'history' && <HistoryIcon size={24} className="text-secondary" />}
                </div>
                <p className="text-secondary text-center text-sm">No {activeLeftTab} found in this room yet.</p>
              </div>
            )}
          </div>
        </aside>
        )}

        {/* Center Canvas */}
        <main className={`canvas-area ${gridType}-grid`}>
          {/* Top Floating Video Strip */}
          {/* Top Floating Video Strip */}
          {isVideoStripVisible && (
            <div 
              className="video-strip" 
              style={{ ...getVideoStripStyle(), display: 'flex', alignItems: 'center', gap: '1rem', zIndex: 10, cursor: 'grab', position: 'absolute' }}
              onPointerDown={handleVideoDragStart}
              onPointerMove={handleVideoDragMove}
              onPointerUp={handleVideoDragEnd}
            >
              {/* Close Button Overlay */}
              <button 
                title="Hide Video Feeds"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsVideoStripVisible(false);
                }}
                className="hide-feeds-btn"
                style={{
                  position: 'absolute',
                  top: '-8px',
                  right: '-8px',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '20px',
                  height: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 50,
                  boxShadow: 'var(--shadow-sm)',
                  fontSize: '12px',
                  lineHeight: 1
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#dc2626'}
                onMouseLeave={e => e.currentTarget.style.background = '#ef4444'}
              >
                <X size={12} />
              </button>

              {/* Local Video Tile */}
              <div className={`video-tile bounce-hover ${mediaState.camera ? 'active' : ''} ${handRaised ? 'raised-hand-glow' : ''}`}>
                {mediaState.camera && hasCameraPermission ? (
                  <video 
                    ref={localVideoRefCallback} 
                    autoPlay 
                    playsInline 
                    muted 
                    className="video-feed" 
                  />
                ) : (
                  <div className="video-placeholder me-cam">ME</div>
                )}
                <div className="tile-name">
                  You {!mediaState.mic && <MicOff size={11} style={{marginLeft:'4px'}} color="#ef4444"/>}
                  {handRaised && <span className="hand-badge" style={{marginLeft: '6px'}}>✋</span>}
                </div>
              </div>

              {/* Remote Video Tile */}
              {roomUsers > 1 && (
                <div className={`video-tile bounce-hover ${Object.keys(raisedHands).some(id => raisedHands[id]) ? 'raised-hand-glow' : ''}`}>
                  <div className="video-placeholder other-cam">U1</div>
                  <div className="tile-name">
                    Remote <MicOff size={11} className="text-secondary" style={{marginLeft: '4px'}}/>
                    {Object.keys(raisedHands).some(id => raisedHands[id]) && <span className="hand-badge" style={{marginLeft: '6px'}}>✋</span>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Interactive HTML5 drawing board & sticky notes overlay */}
          <div className="whiteboard-wrapper" ref={boardRef}>
            <canvas 
              ref={canvasRef}
              className="whiteboard-canvas"
              style={{ position: 'absolute', inset: 0, zIndex: 1 }}
            />
            <canvas 
              ref={overlayCanvasRef}
              className={`whiteboard-canvas overlay-canvas ${activeTool}-active`}
              style={{ position: 'absolute', inset: 0, zIndex: 2 }}
              onMouseDown={handleMouseDownCanvas}
              onMouseMove={handleMouseMoveCanvas}
              onMouseUp={handleMouseUpCanvas}
              onMouseLeave={handleMouseUpCanvas}
            />

            {/* Whiteboard Toolbar */}
            {isToolbarOpen && (
              <div 
                className="glass-card whiteboard-toolbar"
                style={getToolbarStyle()}
              >
                {/* Drag Handle */}
                <div 
                  className="toolbar-drag-handle"
                  onPointerDown={handleToolbarDragStart}
                  onPointerMove={handleToolbarDragMove}
                  onPointerUp={handleToolbarDragEnd}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 4px',
                    cursor: 'grab',
                    color: 'var(--text-secondary)',
                    opacity: 0.6
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--accent-primary)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
                >
                  <GripHorizontal size={18} />
                </div>
                <div className="tool-divider"></div>

                <button title="Select / Move Sticky Notes" onClick={()=>selectTool('cursor')} className={`tool-btn bounce-hover ${activeTool==='cursor'?'active':''}`}><MousePointer2 size={18} /></button>
                <div className="tool-divider"></div>
                
                <button title="Pen Drawing" onClick={()=>selectTool('pen')} className={`tool-btn bounce-hover ${activeTool==='pen'?'active':''}`}><Pen size={18} /></button>
                <button title="Eraser Brush" onClick={()=>selectTool('eraser')} className={`tool-btn bounce-hover ${activeTool==='eraser'?'active':''}`}><Eraser size={18} /></button>
                <button title="Laser Pointer" onClick={()=>selectTool('laser')} className={`tool-btn bounce-hover ${activeTool==='laser'?'active':''}`}><Zap size={18} /></button>
                <button title="Add Text" onClick={()=>selectTool('text')} className={`tool-btn bounce-hover ${activeTool==='text'?'active':''}`}><Type size={18} /></button>
                <div className="tool-divider"></div>
                
                <button title="Rectangle Shape" onClick={()=>selectTool('shape', 'rect')} className={`tool-btn bounce-hover ${activeTool==='shape' && shapeType==='rect'?'active':''}`}><Square size={18} /></button>
                <button title="Circle Shape" onClick={()=>selectTool('shape', 'circle')} className={`tool-btn bounce-hover ${activeTool==='shape' && shapeType==='circle'?'active':''}`}><Circle size={18} /></button>
                <div className="tool-divider"></div>
                
                <div className="sticky-creators" style={{ display: 'flex', gap: '4px', padding: '2px' }}>
                  <button title="Yellow Sticky" onClick={() => createStickyNote('yellow')} className="tool-btn bounce-hover text-yellow"><StickyNote size={18} fill="#fef08a" /></button>
                  <button title="Pink Sticky" onClick={() => createStickyNote('pink')} className="tool-btn bounce-hover text-pink"><StickyNote size={18} fill="#fbcfe8" /></button>
                  <button title="Blue Sticky" onClick={() => createStickyNote('blue')} className="tool-btn bounce-hover text-blue"><StickyNote size={18} fill="#93c5fd" /></button>
                  <button title="Green Sticky" onClick={() => createStickyNote('green')} className="tool-btn bounce-hover text-green"><StickyNote size={18} fill="#86efac" /></button>
                </div>
                <div className="tool-divider"></div>
                
                <button title="Clear Whiteboard" onClick={clearWhiteboard} className="tool-btn bounce-hover text-danger"><Trash2 size={18} /></button>
              </div>
            )}

            {/* Brush Controls Panel (Visible when Pen/Shape/Text is active and showBrushPanel is true) */}
            {showBrushPanel && (activeTool === 'pen' || activeTool === 'shape' || activeTool === 'eraser' || activeTool === 'text') && (
              <div 
                className="glass-card brush-controls-panel"
                style={getBrushPanelStyle()}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <span className="section-label" style={{ margin: 0 }}>
                    {activeTool === 'pen' ? 'Pen Brush' : activeTool === 'eraser' ? 'Eraser' : `Shape (${shapeType})`}
                  </span>
                  <button 
                    title="Close Panel"
                    onClick={() => setShowBrushPanel(false)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'rgba(255, 255, 255, 0.4)',
                      fontSize: '1.2rem',
                      cursor: 'pointer',
                      lineHeight: 1,
                      padding: '0 4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'color 0.2s'
                    }}
                    onMouseEnter={e => e.target.style.color = '#ef4444'}
                    onMouseLeave={e => e.target.style.color = 'rgba(255, 255, 255, 0.4)'}
                  >
                    ×
                  </button>
                </div>
                
                {activeTool !== 'eraser' && (
                  <div className="control-section">
                    <span className="section-label">Color:</span>
                    <div className="color-dots">
                      {['#818cf8', '#ec4899', '#f43f5e', '#10b981', '#f59e0b', '#ffffff', '#000000'].map(c => (
                        <button 
                          key={c}
                          style={{ backgroundColor: c }}
                          className={`color-dot ${brushColor === c ? 'selected' : ''}`}
                          onClick={() => {
                            setBrushColor(c);
                            setShowBrushPanel(false);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <div className="control-section">
                  <span className="section-label">Size ({brushSize}px):</span>
                  <input 
                    type="range" 
                    min="2" 
                    max="32" 
                    value={brushSize} 
                    onChange={e => setBrushSize(parseInt(e.target.value))}
                    onMouseUp={() => setShowBrushPanel(false)}
                    onTouchEnd={() => setShowBrushPanel(false)}
                    className="size-slider"
                  />
                </div>
              </div>
            )}

            {/* Custom Inline Text Input Tool */}
            {isTypingText && (
              <input 
                type="text"
                value={textInputValue}
                onChange={e => setTextInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (textInputValue.trim()) {
                      const finalAction = {
                        tool: 'text',
                        x: textInputPosition.x,
                        y: textInputPosition.y,
                        text: textInputValue.trim(),
                        color: brushColor,
                        size: brushSize
                      };
                      setDrawActions(prev => {
                        const next = [...prev, finalAction];
                        if (ws && ws.readyState === WebSocket.OPEN) {
                          ws.send(JSON.stringify({ type: 'draw', action: finalAction, roomId }));
                        }
                        setTimeout(() => redrawCanvas(next), 0);
                        return next;
                      });
                    }
                    setIsTypingText(false);
                  } else if (e.key === 'Escape') {
                    setIsTypingText(false);
                  }
                }}
                onBlur={() => {
                  if (textInputValue.trim()) {
                    const finalAction = {
                      tool: 'text',
                      x: textInputPosition.x,
                      y: textInputPosition.y,
                      text: textInputValue.trim(),
                      color: brushColor,
                      size: brushSize
                    };
                    setDrawActions(prev => {
                      const next = [...prev, finalAction];
                      if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'draw', action: finalAction, roomId }));
                      }
                      setTimeout(() => redrawCanvas(next), 0);
                      return next;
                    });
                  }
                  setIsTypingText(false);
                }}
                autoFocus
                style={{
                  position: 'absolute',
                  left: `${textInputPosition.x}px`,
                  top: `${textInputPosition.y - 12}px`,
                  font: `bold ${brushSize * 3 + 12}px Inter, sans-serif`,
                  color: brushColor,
                  background: 'transparent',
                  border: '1px dashed var(--accent-primary)',
                  outline: 'none',
                  padding: '2px',
                  zIndex: 1000,
                  caretColor: brushColor
                }}
              />
            )}

            <div className="static-board-content">
              {/* Draggable Sticky Notes */}
              {stickyNotes.map(note => (
                <div 
                  key={note.id} 
                  className={`sticky-note-card ${activeTool === 'cursor' ? 'draggable' : ''}`}
                  style={{ 
                    transform: `translate(${note.x}px, ${note.y}px)`,
                    backgroundColor: note.color 
                  }}
                  onPointerDown={(e) => handleStickyPointerDown(e, note.id)}
                  onPointerMove={(e) => handleStickyPointerMove(e, note.id)}
                  onPointerUp={(e) => handleStickyPointerUp(e, note.id)}
                >
                  <div className="sticky-note-header">
                    <span className="note-id">Note {note.id}</span>
                    <button 
                      title="Delete Note" 
                      onClick={() => deleteStickyNote(note.id)} 
                      className="delete-note-btn"
                    >
                      ×
                    </button>
                  </div>
                  <textarea 
                    value={note.text}
                    onChange={(e) => handleStickyTextChange(note.id, e.target.value)}
                    placeholder="Type notes here..."
                    className="sticky-note-textarea"
                  />
                </div>
              ))}

              {/* Remote Cursors */}
              {Object.keys(cursors).map(id => {
                if (id !== clientId) {
                  return (
                    <div key={id} className="remote-cursor" style={{ transform: `translate(${cursors[id].x}px, ${cursors[id].y}px)` }}>
                      <MousePointer2 size={18} fill="var(--accent-secondary)" color="var(--accent-secondary)" />
                      <span className="cursor-label">{id.slice(0,4)}</span>
                    </div>
                  );
                }
                return null;
              })}
            </div>

            {/* Draggable, Resizable Screen Share Window */}
            {mediaState.screen && screenStream && (
              <div 
                className="glass floating-screen-share"
                style={{
                  left: `${screenPosition.x}px`,
                  top: `${screenPosition.y}px`,
                  width: `${screenSize.width}px`,
                  height: `${screenSize.height}px`,
                  position: 'absolute',
                  zIndex: 1000
                }}
              >
                <div 
                  className="screen-share-header"
                  onPointerDown={handleScreenDragStart}
                  onPointerMove={handleScreenDragMove}
                  onPointerUp={handleScreenDragEnd}
                >
                  <div className="flex-center" style={{display: 'flex', alignItems: 'center'}}>
                    <span className="live-dot" style={{marginRight:'6px'}}></span>
                    <span className="text-sm font-semibold">Your Screen Share</span>
                  </div>
                  <button className="close-btn" onClick={stopScreenShare}>×</button>
                </div>
                <div className="screen-share-video-wrap">
                  <video 
                    ref={screenVideoRefCallback}
                    autoPlay 
                    playsInline 
                    muted 
                  />
                </div>
                <div 
                  className="screen-share-resize-handle"
                  onPointerDown={handleScreenResizeStart}
                  onPointerMove={handleScreenResizeMove}
                  onPointerUp={handleScreenResizeEnd}
                />
              </div>
            )}
          </div>
        </main>

        {/* Right Sidebar - AI Assistant */}
        {isAiPanelOpen && (
          <aside className="glass-panel right-sidebar">
            <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3><Sparkles size={18} className="text-gradient" style={{marginRight: '0.5rem'}} /> LiveCollab AI</h3>
              <button 
                title="Gemini API Key Settings"
                onClick={() => setShowApiKeySetting(!showApiKeySetting)} 
                style={{ color: 'var(--text-secondary)', padding: '4px', cursor: 'pointer' }}
                className="bounce-hover"
              >
                <Key size={16} className={(geminiApiKey || hasBackendKey) ? "text-gradient" : ""} />
              </button>
            </div>
            
            {((!geminiApiKey && !hasBackendKey) || showApiKeySetting) ? (
              <div className="ai-key-config" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, overflowY: 'auto' }}>
                <h4 style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Key size={16} className="text-gradient" /> Gemini API Settings
                </h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Connect your Google Gemini API Key to enable real-time whiteboard analysis, dynamic summaries, task extraction, and ask general knowledge questions.
                </p>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Get a free key from <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>Google AI Studio</a>.
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <input 
                    type="password" 
                    placeholder={geminiApiKey ? "••••••••••••••••" : "Paste your API key here..."} 
                    value={tempApiKey}
                    onChange={e => setTempApiKey(e.target.value)}
                    className="input-glass"
                    style={{ width: '100%' }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button 
                      onClick={() => {
                        if (tempApiKey.trim()) {
                          localStorage.setItem('livecollab_gemini_key', tempApiKey.trim());
                          setGeminiApiKey(tempApiKey.trim());
                          setTempApiKey('');
                          setShowApiKeySetting(false);
                        }
                      }} 
                      className="btn-primary" 
                      style={{ flex: 1, padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                    >
                      Save Key
                    </button>
                    {geminiApiKey && (
                      <button 
                        onClick={() => {
                          localStorage.removeItem('livecollab_gemini_key');
                          setGeminiApiKey('');
                          setTempApiKey('');
                        }} 
                        className="btn-danger" 
                        style={{ flex: 1, padding: '0.5rem 1rem', fontSize: '0.85rem', background: 'rgba(239, 68, 68, 0.1)' }}
                      >
                        Clear Key
                      </button>
                    )}
                  </div>
                </div>
                
                {geminiApiKey && (
                  <button 
                    onClick={() => {
                      setShowApiKeySetting(false);
                      setTempApiKey('');
                    }} 
                    className="btn-secondary" 
                    style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', width: '100%', marginTop: 'auto' }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="ai-prompts">
                  <button className="ai-btn bounce-hover" onClick={() => simulateAiResponse('summary')}><FileText size={14}/> Summarize Board</button>
                  <button className="ai-btn bounce-hover" onClick={() => simulateAiResponse('tasks')}><ListTodo size={14}/> Create Tasks</button>
                  <button className="ai-btn bounce-hover" onClick={() => simulateAiResponse('notes')}><CheckSquare size={14}/> Generate Notes</button>
                </div>

                <div className="ai-chat">
                  <div className="ai-chat-history" ref={aiChatHistoryRef}>
                    {aiMessages.map((msg, index) => (
                      <div key={index} className={`message ${msg.role === 'user' ? 'me' : 'ai-msg'}`}>
                        <span className="sender-name">{msg.role === 'user' ? 'You' : 'LiveCollab AI'}</span>
                        <div className="bubble">
                          {msg.text.split('\n').map((line, lIdx) => {
                            if (line.startsWith('* ')) {
                              return <li key={lIdx} style={{marginLeft: '1rem', listStyleType: 'disc'}}>{line.substring(2)}</li>;
                            }
                            if (line.startsWith('#### ') || line.startsWith('### ')) {
                              return <h4 key={lIdx} style={{marginTop: '0.5rem', fontWeight: 600, color: 'var(--accent-primary)'}}>{line.replace(/#+\s+/, '')}</h4>;
                            }
                            return <p key={lIdx} style={{margin: '0.2rem 0'}}>{line}</p>;
                          })}
                        </div>
                      </div>
                    ))}
                    {isAiLoading && (
                      <div className="ai-typing-loader">
                        <span></span><span></span><span></span>
                      </div>
                    )}
                    <div ref={aiBottomRef} />
                  </div>
                  <form onSubmit={handleAiSend} className="ai-input-area">
                    <div className="input-group">
                      <input 
                        type="text" 
                        value={aiInput}
                        onChange={e => setAiInput(e.target.value)}
                        placeholder="Ask AI anything..." 
                        className="input-glass" 
                        disabled={isAiLoading}
                      />
                      <button type="submit" className="btn-send" disabled={isAiLoading}><Send size={16} /></button>
                    </div>
                  </form>
                </div>
              </>
            )}
          </aside>
        )}
      </div>

      {/* Bottom Control Bar */}
      <footer className="glass control-bar">
        <div className="control-group">
          <button 
            title={isLeftSidebarOpen ? "Hide Chat Sidebar" : "Show Chat Sidebar"} 
            className={`control-btn text-btn bounce-hover ${isLeftSidebarOpen ? 'active-toggle' : ''}`} 
            onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
            style={{ position: 'relative' }}
          >
            <MessageSquare size={18} style={{marginRight:'0.4rem'}}/> Chat
            {unreadChats > 0 && (
              <span className="notification-badge">{unreadChats}</span>
            )}
          </button>
          <button 
            title={isToolbarOpen ? "Hide Whiteboard Tools" : "Show Whiteboard Tools"} 
            className={`control-btn text-btn bounce-hover ${isToolbarOpen ? 'active-toggle' : ''}`} 
            onClick={() => setIsToolbarOpen(!isToolbarOpen)}
          >
            <Pen size={18} style={{marginRight:'0.4rem'}}/> Tools
          </button>
          <button 
            title={isVideoStripVisible ? "Hide Video Feeds" : "Show Video Feeds"} 
            className={`control-btn text-btn bounce-hover ${isVideoStripVisible ? 'active-toggle' : ''}`} 
            onClick={() => setIsVideoStripVisible(!isVideoStripVisible)}
          >
            <Video size={18} style={{marginRight:'0.4rem'}}/> Feeds
          </button>
        </div>
        
        <div className="control-group center-controls">
          <button title="Toggle Microphone" className={`control-btn bounce-hover ${!mediaState.mic ? 'muted' : ''}`} onClick={() => toggleMedia('mic')}>
            {mediaState.mic ? <Mic size={22} /> : <MicOff size={22} />}
          </button>
          <button title="Toggle Video Cam" className={`control-btn bounce-hover ${!mediaState.camera ? 'muted' : ''}`} onClick={() => toggleMedia('camera')}>
            {mediaState.camera ? <Video size={22} /> : <VideoOff size={22} />}
          </button>
          <button title="Share Screen" className={`control-btn bounce-hover ${mediaState.screen ? 'active-share' : ''}`} onClick={() => toggleMedia('screen')}>
            <MonitorUp size={22} />
          </button>
          <button 
            title="Raise Hand" 
            className={`control-btn bounce-hover ${handRaised ? 'active-hand' : ''}`} 
            onClick={toggleRaiseHand}
          >
            <Hand size={22} />
          </button>
          
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button 
              title="More Options" 
              className={`control-btn bounce-hover ${isMoreMenuOpen ? 'active-more' : ''}`} 
              onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
            >
              <MoreHorizontal size={22} />
            </button>
            {isMoreMenuOpen && (
              <div className="glass more-options-menu">
                <button className="menu-item" onClick={exportBoardAsPng}>
                  <Download size={16} style={{marginRight: '8px'}} /> Export Board as PNG
                </button>
                <button className="menu-item" onClick={() => {
                  const nextGrids = { 'dotted': 'lines', 'lines': 'none', 'none': 'dotted' };
                  setGridType(nextGrids[gridType]);
                  setIsMoreMenuOpen(false);
                }}>
                  <Grid size={16} style={{marginRight: '8px'}} /> Grid: {gridType.toUpperCase()}
                </button>
                <button className="menu-item text-danger" onClick={() => { setIsMoreMenuOpen(false); clearWhiteboard(); }}>
                  <Trash2 size={16} style={{marginRight: '8px'}} /> Clear Whiteboard
                </button>
              </div>
            )}
          </div>

          <button title="End Session" className="control-btn end-call bounce-hover" onClick={() => navigate('/dashboard')}><PhoneOff size={22} /></button>
        </div>

        <div className="control-group right-controls" style={{ gap: '0.5rem' }}>
          <button 
            title="Toggle AI Panel" 
            className={`control-btn text-btn bounce-hover ${isAiPanelOpen ? 'active-toggle' : ''}`} 
            onClick={() => setIsAiPanelOpen(!isAiPanelOpen)}
            style={{ position: 'relative' }}
          >
            <Sparkles size={18} style={{marginRight:'0.4rem'}}/> AI
            {unreadAi && (
              <span className="notification-dot"></span>
            )}
          </button>
          <button 
            title={theme === 'light' ? "Switch to Dark Mode" : "Switch to Light Mode"} 
            className="control-btn bounce-hover"
            onClick={toggleTheme}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>
          <button 
            title="Settings" 
            className="control-btn bounce-hover"
            onClick={() => {
              const newName = prompt("Enter your name:", JSON.parse(localStorage.getItem('user') || '{}').name || "User");
              if (newName) {
                const userObj = JSON.parse(localStorage.getItem('user') || '{}');
                userObj.name = newName;
                localStorage.setItem('user', JSON.stringify(userObj));
                alert("Username updated to: " + newName);
                window.location.reload();
              }
            }}
          >
            <Settings size={20} />
          </button>
        </div>
      </footer>
    </div>
  );
};

export default Room;
