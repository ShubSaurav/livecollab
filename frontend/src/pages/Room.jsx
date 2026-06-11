import React, { useState, useEffect, useRef, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  MessageSquare, Users, FolderOpen, History as HistoryIcon, 
  Pen, Type, StickyNote, Image as ImageIcon, Square, Circle, Eraser, Undo, Redo, MousePointer2,
  Sparkles, ListTodo, FileText, CheckSquare, MessageCircle,
  Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, Hand, Settings,
  Link, UserPlus, MoreHorizontal, Maximize2, Trash2, Send, Download, Grid
} from 'lucide-react';
import { wsBaseUrl } from '../config';
import { ThemeContext } from '../App';
import './Room.css';

const Room = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { theme } = useContext(ThemeContext);
  
  const [activeLeftTab, setActiveLeftTab] = useState('chat');
  const [activeTool, setActiveTool] = useState('pen'); // default to pen drawing
  const [showBrushPanel, setShowBrushPanel] = useState(true);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(true);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  
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
    if (tool === 'pen' || tool === 'eraser' || tool === 'shape') {
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

  // Sticky Notes States
  const [stickyNotes, setStickyNotes] = useState([]);
  const [draggingNoteId, setDraggingNoteId] = useState(null);

  // AI Chat States
  const [aiMessages, setAiMessages] = useState([
    { role: 'assistant', text: 'Hey there! I am the LiveCollab AI assistant. Draw on the board, drop sticky notes, or type messages, and ask me to summarize the board or generate action checklists!' }
  ]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiInput, setAiInput] = useState('');

  const boardRef = useRef(null);
  const canvasRef = useRef(null);
  const chatBottomRef = useRef(null);
  const aiBottomRef = useRef(null);
  const startPointRef = useRef({ x: 0, y: 0 });
  const currentPathRef = useRef([]);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const drawActionsRef = useRef([]);

  useEffect(() => {
    drawActionsRef.current = drawActions;
  }, [drawActions]);

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

  // Auto-scroll chats
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Auto-scroll AI logs
  useEffect(() => {
    if (aiBottomRef.current) {
      aiBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [aiMessages]);

  // Drawing functions
  const drawActionOnCtx = (ctx, action) => {
    if (!action) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = action.color;
    ctx.lineWidth = action.size;

    if (action.tool === 'pen' || action.tool === 'eraser') {
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

  const redrawCanvas = (actionsList, currentDrawingAction = null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    actionsList.forEach(action => {
      drawActionOnCtx(ctx, action);
    });

    if (currentDrawingAction) {
      drawActionOnCtx(ctx, currentDrawingAction);
    }
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

    if (activeTool === 'pen' || activeTool === 'eraser') {
      const prevPoint = currentPathRef.current[currentPathRef.current.length - 1];
      const newPoint = { x, y };
      currentPathRef.current.push(newPoint);

      // Render local segment
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
      redrawCanvas(drawActions, previewAction);
    }
  };

  const handleMouseUpCanvas = (e) => {
    if (!isDrawing || activeTool === 'cursor') return;
    setIsDrawing(false);

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

  // AI assistant handlers
  const simulateAiResponse = (promptType) => {
    setIsAiLoading(true);
    let fullText = '';
    
    const notesCount = stickyNotes.length;
    const drawingsCount = drawActions.length;
    const chatMsgCount = messages.filter(m => m.type === 'chat').length;
    
    if (promptType === 'summary') {
      fullText = `### LiveCollab Workspace Summary 📊\n\nI have scanned the active canvas, sticky elements, and team chat:\n* **Whiteboard Details**: Detected **${drawingsCount} sketches/shapes** drawn on the board.\n* **Sticky Workspace**: Identified **${notesCount} active sticky notes**.\n* **Collaboration Hub**: Exchanged **${chatMsgCount} team chat logs** in this room.\n\n#### Key Focus Areas:\n1. **Dynamic Whiteboarding**: High concentration of visual shapes/wireframes suggests layout architecture brainstorms.\n2. **Draggable Tasks**: Floating notes map structural dependencies. Tasks focus on setup requirements and testing coordinates.\n\n*What else can I help you extract or organize?*`;
    } else if (promptType === 'tasks') {
      const extracted = stickyNotes
        .map((n, i) => `  ${i + 1}. **Sticky Task [${n.colorName.toUpperCase()}]**: "${n.text.substring(0, 50)}${n.text.length > 50 ? '...' : ''}"`)
        .join('\n');
      
      fullText = `### Automated Task Extraction 📋\n\nHere is your team's checklist built directly from sticky notes:\n\n${extracted || '  1. **Default Action**: Initialize whiteboard designs.\n  2. **WS Test**: Open multi-window sync validation.\n  3. **Interface check**: Verify light/dark style parameters.'}\n\n*You can copy this list directly into your planning issues.*`;
    } else if (promptType === 'notes') {
      fullText = `### Automated Meeting Notes 📝\n* **Workspace ID**: Room \`${roomId}\`\n* **Active Collab Users**: ${roomUsers} member(s)\n* **Technical Decisions**: Database fallback handles ENOTFOUND/timeout DNS conditions with in-memory fallback buffers.\n\n**Next Action Items**:\n- Standardize responsive styling variables.\n- Polish Outfit theme selectors.`;
    } else {
      fullText = `I am analyzing the workspace regarding "${promptType}". On the board, there are ${notesCount} sticky notes and ${drawingsCount} drawing paths. Let me know if you would like me to draft notes, checklists, or summaries from them!`;
    }

    setAiMessages(prev => [...prev, { role: 'assistant', text: '' }]);
    
    let currentText = '';
    let charIndex = 0;
    const interval = setInterval(() => {
      if (charIndex < fullText.length) {
        currentText += fullText[charIndex];
        setAiMessages(prev => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', text: currentText };
          return next;
        });
        charIndex += 4;
      } else {
        clearInterval(interval);
        setIsAiLoading(false);
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
              backgroundColor: '#ffffff', 
              padding: '4px', 
              borderRadius: '8px', 
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
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
                <div className="chat-messages">
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
          <div className="video-strip">
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

          {/* Interactive HTML5 drawing board & sticky notes overlay */}
          <div className="whiteboard-wrapper" ref={boardRef}>
            <canvas 
              ref={canvasRef}
              className={`whiteboard-canvas ${activeTool}-active`}
              onMouseDown={handleMouseDownCanvas}
              onMouseMove={handleMouseMoveCanvas}
              onMouseUp={handleMouseUpCanvas}
              onMouseLeave={handleMouseUpCanvas}
            />

            {/* Whiteboard Toolbar */}
            <div className="glass-card whiteboard-toolbar">
              <button title="Select / Move Sticky Notes" onClick={()=>selectTool('cursor')} className={`tool-btn bounce-hover ${activeTool==='cursor'?'active':''}`}><MousePointer2 size={18} /></button>
              <div className="tool-divider"></div>
              
              <button title="Pen Drawing" onClick={()=>selectTool('pen')} className={`tool-btn bounce-hover ${activeTool==='pen'?'active':''}`}><Pen size={18} /></button>
              <button title="Eraser Brush" onClick={()=>selectTool('eraser')} className={`tool-btn bounce-hover ${activeTool==='eraser'?'active':''}`}><Eraser size={18} /></button>
              <div className="tool-divider"></div>
              
              <button title="Rectangle Shape" onClick={()=>selectTool('shape', 'rect')} className={`tool-btn bounce-hover ${activeTool==='shape' && shapeType==='rect'?'active':''}`}><Square size={18} /></button>
              <button title="Circle Shape" onClick={()=>selectTool('shape', 'circle')} className={`tool-btn bounce-hover ${activeTool==='shape' && shapeType==='circle'?'active':''}`}><Circle size={18} /></button>
              <div className="tool-divider"></div>
              
              <div className="sticky-creators">
                <button title="Yellow Sticky" onClick={() => createStickyNote('yellow')} className="tool-btn bounce-hover text-yellow"><StickyNote size={18} fill="#fef08a" /></button>
                <button title="Pink Sticky" onClick={() => createStickyNote('pink')} className="tool-btn bounce-hover text-pink"><StickyNote size={18} fill="#fbcfe8" /></button>
                <button title="Blue Sticky" onClick={() => createStickyNote('blue')} className="tool-btn bounce-hover text-blue"><StickyNote size={18} fill="#93c5fd" /></button>
                <button title="Green Sticky" onClick={() => createStickyNote('green')} className="tool-btn bounce-hover text-green"><StickyNote size={18} fill="#86efac" /></button>
              </div>
              <div className="tool-divider"></div>
              
              <button title="Clear Whiteboard" onClick={clearWhiteboard} className="tool-btn bounce-hover text-danger"><Trash2 size={18} /></button>
            </div>

            {/* Brush Controls Panel (Visible when Pen/Shape is active and showBrushPanel is true) */}
            {showBrushPanel && (activeTool === 'pen' || activeTool === 'shape' || activeTool === 'eraser') && (
              <div className="glass-card brush-controls-panel">
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
            <div className="sidebar-header">
              <h3><Sparkles size={18} className="text-gradient" style={{marginRight: '0.5rem'}} /> LiveCollab AI</h3>
            </div>
            
            <div className="ai-prompts">
              <button className="ai-btn bounce-hover" onClick={() => simulateAiResponse('summary')}><FileText size={14}/> Summarize Board</button>
              <button className="ai-btn bounce-hover" onClick={() => simulateAiResponse('tasks')}><ListTodo size={14}/> Create Tasks</button>
              <button className="ai-btn bounce-hover" onClick={() => simulateAiResponse('notes')}><CheckSquare size={14}/> Generate Notes</button>
            </div>

            <div className="ai-chat">
              <div className="ai-chat-history">
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
                    placeholder="Ask AI to analyze board..." 
                    className="input-glass" 
                    disabled={isAiLoading}
                  />
                  <button type="submit" className="btn-send" disabled={isAiLoading}><Send size={16} /></button>
                </div>
              </form>
            </div>
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
          >
            <MessageSquare size={18} style={{marginRight:'0.4rem'}}/> Chat
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

        <div className="control-group right-controls">
          <button title="Toggle AI Panel" className={`control-btn text-btn bounce-hover ${isAiPanelOpen ? 'active-toggle' : ''}`} onClick={() => setIsAiPanelOpen(!isAiPanelOpen)}>
            <Sparkles size={18} style={{marginRight:'0.4rem'}}/> AI
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
