import React, { useState, useEffect } from 'react';
import { Toaster, toast } from 'sonner';
import ConnectionStatus from './components/ConnectionStatus';
import PatientRegistration from './components/PatientRegistration';
import ChatInterface from './components/ChatInterface';
import SummaryDisplay from './components/SummaryDisplay';
import { checkHealth } from './services/api';
import { Activity, RefreshCw } from 'lucide-react';

interface Patient {
  age: string;
  gender: string;
}

interface ChatMessage {
  id: string;
  type: 'user' | 'bot';
  content: string;
  timestamp: Date;
}

interface ChatSession {
  sessionId: string;
  patient: Patient;
  messages: ChatMessage[];
  questionCount: number;
  isComplete: boolean;
  summary?: string; // เพิ่ม summary field
}

export default function App() {
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isCheckingConnection, setIsCheckingConnection] = useState(true);

  // Check server health on mount and periodically
  useEffect(() => {
    checkServerHealth();
    const interval = setInterval(checkServerHealth, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const checkServerHealth = async () => {
    try {
      setIsCheckingConnection(true);
      const health = await checkHealth();
      const connected = health.status === "healthy";
      setIsConnected(connected);
      
      if (connected && !isConnected) {
        toast.success('เชื่อมต่อเซิร์ฟเวอร์สำเร็จ');
      }
    } catch (error) {
      setIsConnected(false);
      console.error('Health check failed:', error);
    } finally {
      setIsCheckingConnection(false);
    }
  };

  const handleRefreshConnection = async () => {
    await checkServerHealth();
    if (isConnected) {
      toast.success('เชื่อมต่อเซิร์ฟเวอร์สำเร็จ');
    } else {
      toast.error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    }
  };

  const handlePatientRegistered = (patient: Patient, sessionId: string) => {
    setCurrentSession({
      sessionId,
      patient,
      messages: [],
      questionCount: 0,
      isComplete: false
    });
    toast.success('ลงทะเบียนผู้ป่วยสำเร็จ');
  };

  const handleChatComplete = () => {
    if (currentSession) {
      setCurrentSession({
        ...currentSession,
        isComplete: true
      });
      toast.success('การประเมินอาการเสร็จสิ้น');
    }
  };

  const handleShowSummary = () => {
    setShowSummary(true);
  };

  const handleReset = () => {
    if (window.confirm('คุณแน่ใจหรือไม่ที่จะเริ่มการปรึกษาใหม่? ข้อมูลปัจจุบันจะถูกลบทั้งหมด')) {
      setCurrentSession(null);
      setShowSummary(false);
      toast.info('รีเซ็ตเซสชันสำเร็จ');
    }
  };

  const renderCurrentView = () => {
    if (showSummary && currentSession) {
      return (
        <SummaryDisplay 
          sessionId={currentSession.sessionId}
          sessionSummary={currentSession.summary} // ส่ง summary ที่ได้จาก ChatInterface
          onBack={() => setShowSummary(false)}
          onReset={handleReset}
        />
      );
    }

    if (currentSession) {
      return (
        <ChatInterface
          session={currentSession}
          onSessionUpdate={setCurrentSession}
          onChatComplete={handleChatComplete}
          onShowSummary={handleShowSummary}
          onReset={handleReset}
        />
      );
    }

    return (
      <PatientRegistration 
        onPatientRegistered={handlePatientRegistered}
        isConnected={isConnected}
      />
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-r from-blue-500 to-green-500 rounded-lg">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">การปรึกษาทางการแพทย์</h1>
                <p className="text-gray-700 text-sm">ระบบประเมินสุขภาพด้วย AI</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={handleRefreshConnection}
                disabled={isCheckingConnection}
                className="p-2 text-gray-700 hover:text-blue-600 transition-colors disabled:opacity-50"
                title="รีเฟรชการเชื่อมต่อ"
              >
                <RefreshCw className={`w-5 h-5 ${isCheckingConnection ? 'animate-spin' : ''}`} />
              </button>
              <ConnectionStatus isConnected={isConnected} isChecking={isCheckingConnection} />
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          {renderCurrentView()}
        </main>

        {/* Footer */}
        <footer className="mt-8 text-center text-gray-600 text-sm">
          <p>นี่เป็นเครื่องมือประเมินสุขภาพด้วย AI ควรปรึกษาแพทย์เพื่อการวินิจฉัยและรักษาที่ถูกต้อง</p>
        </footer>
      </div>

      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            color: '#374151',
          },
        }}
      />
    </div>
  );
}