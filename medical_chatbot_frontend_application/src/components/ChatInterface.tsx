import React, { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { startChat, continueChat, generateSummary } from '../services/api';
import ChatMessage from './ChatMessage';
import { Send, Loader2, FileText, RotateCcw, Brain, Clock } from 'lucide-react';

interface ChatMessage {
  id: string;
  type: 'user' | 'bot';
  content: string;
  timestamp: Date;
}

interface ChatSession {
  sessionId: string;
  patient: { age: string; gender: string };
  messages: ChatMessage[];
  questionCount: number;
  isComplete: boolean;
  summary?: string;
}

interface ChatInterfaceProps {
  session: ChatSession;
  onSessionUpdate: (session: ChatSession) => void;
  onChatComplete: () => void;
  onShowSummary: () => void;
  onReset: () => void;
}

export default function ChatInterface({
  session,
  onSessionUpdate,
  onChatComplete,
  onShowSummary,
  onReset
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [loadingTime, setLoadingTime] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const loadingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    scrollToBottom();
  }, [session.messages]);

  useEffect(() => {
    if (isLoading || isGeneratingSummary) {
      setLoadingTime(0);
      loadingIntervalRef.current = setInterval(() => {
        setLoadingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (loadingIntervalRef.current) {
        clearInterval(loadingIntervalRef.current);
        loadingIntervalRef.current = null;
      }
      setLoadingTime(0);
    }

    return () => {
      if (loadingIntervalRef.current) {
        clearInterval(loadingIntervalRef.current);
      }
    };
  }, [isLoading, isGeneratingSummary]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // ฟังก์ชันแยกแยะ summary ที่ได้จาก generateSummary
  const extractSummaryFromResponse = (summaryResponse: any): string => {
    console.log('🔍 Extracting summary from generateSummary response:', summaryResponse);
    
    // กรณีที่ 1: มี summary field และเป็น string
    if (summaryResponse && typeof summaryResponse.summary === 'string') {
      console.log('✅ Found summary field as string');
      return summaryResponse.summary;
    }
    
    // กรณีที่ 2: เป็น string โดยตรง
    if (typeof summaryResponse === 'string') {
      console.log('✅ Response is direct string');
      return summaryResponse;
    }
    
    // กรณีที่ 3: มี response field
    if (summaryResponse && typeof summaryResponse.response === 'string') {
      console.log('✅ Found response field as string');
      return summaryResponse.response;
    }
    
    // กรณีสุดท้าย: แปลงเป็น JSON string
    console.log('⚠️ No valid summary found, converting to JSON string');
    return JSON.stringify(summaryResponse);
  };

  // Test function สำหรับทดสอบ generateSummary
  const testSummary = async () => {
    console.log('🧪 Testing generateSummary...');
    console.log('🧪 Session ID:', session.sessionId);
    try {
      const result = await generateSummary(session.sessionId);
      console.log('🧪 Test result:', result);
      const extractedSummary = extractSummaryFromResponse(result);
      console.log('🧪 Extracted summary:', extractedSummary);
      toast.success('ทดสอบ generateSummary สำเร็จ - ดู console สำหรับรายละเอียด');
    } catch (error) {
      console.error('🧪 Test failed:', error);
      toast.error('ทดสอบล้มเหลว: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim()) {
      toast.error('กรุณาใส่ข้อความ');
      return;
    }

    if (session.isComplete) {
      toast.info('การสนทนาเสร็จสิ้นแล้ว คุณสามารถดูสรุปได้');
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    console.log('💬 Adding user message:', userMessage.content);

    // Add user message immediately
    const updatedSession = {
      ...session,
      messages: [...session.messages, userMessage]
    };
    onSessionUpdate(updatedSession);
    setInput('');
    setIsLoading(true);

    // Show loading toast with longer duration
    const loadingToast = toast.loading('🤖 AI กำลังวิเคราะห์คำตอบ - รอไม่จำกัดเวลา...', {
      duration: Infinity,
    });

    try {
      let response;
      
      if (session.messages.length === 0) {
        // First message - start chat with symptoms
        console.log('🚀 Starting chat with symptoms:', userMessage.content);
        response = await startChat(session.sessionId, userMessage.content);
      } else {
        // Continue chat with answer
        console.log('🔄 Continuing chat with answer:', userMessage.content);
        response = await continueChat(session.sessionId, userMessage.content);
      }

      console.log('📝 Raw Backend response:', response);
      console.log('📝 Response type:', response?.type);
      console.log('📝 Response content:', response?.response);

      // Dismiss loading toast
      toast.dismiss(loadingToast);

      // ✅ แก้ไขหลัก: ตรวจสอบประเภทของการตอบกลับจาก backend
      if (response && response.type === 'summary') {
        // ได้รับ summary แล้ว - เรียก summarize endpoint
        console.log('📋 🎉 CHAT COMPLETE! Backend returned type: summary');
        console.log('📋 Will call generateSummary for session:', session.sessionId);
        
        // แสดง bot message ก่อน
        const summaryStartMessage: ChatMessage = {
          id: `bot-${Date.now()}`,
          type: 'bot',
          content: response.response || 'ขอบคุณสำหรับข้อมูลที่ให้มา ระบบจะประมวลผลและสรุปการปรึกษาให้คุณ',
          timestamp: new Date()
        };

        const sessionWithBotMessage = {
          ...updatedSession,
          messages: [...updatedSession.messages, summaryStartMessage]
        };
        onSessionUpdate(sessionWithBotMessage);
        
        // ✅ เริ่มสรุปทันที
        setIsGeneratingSummary(true);
        
        const summaryToast = toast.loading('📋 กำลังสรุปการปรึกษา - รอไม่จำกัดเวลา...', {
          duration: Infinity,
        });

        try {
          // ✅ เรียกใช้ summarize endpoint
          console.log('📋 🚀 Calling generateSummary API for session:', session.sessionId);
          const summaryResponse = await generateSummary(session.sessionId);
          console.log('📋 ✅ Raw summary response received:', summaryResponse);
          
          // แยกแยะ summary จาก response
          const extractedSummary = extractSummaryFromResponse(summaryResponse);
          console.log('📋 ✅ Extracted summary:', extractedSummary);
          console.log('📋 ✅ Summary length:', extractedSummary.length);
          
          // ตรวจสอบว่า summary มีข้อมูลจริงหรือไม่
          if (extractedSummary && extractedSummary.length > 50 && !extractedSummary.includes('ไม่พบ')) {
            const summaryMessage: ChatMessage = {
              id: `summary-${Date.now()}`,
              type: 'bot',
              content: `📋 **การประเมินอาการเสร็จสิ้น**\n\nระบบได้ประมวลผลและสรุปการปรึกษาเรียบร้อยแล้ว\n\n✅ จำนวนคำถามที่ถาม: ${Math.floor(sessionWithBotMessage.messages.length / 2)} คำถาม\n✅ ข้อมูลครบถ้วนสำหรับการวิเคราะห์\n\n📋 กรุณาคลิกปุ่ม "ดูสรุป" เพื่อดูรายละเอียดการประเมินฉบับเต็ม`,
              timestamp: new Date()
            };

            const finalSession = {
              ...sessionWithBotMessage,
              messages: [...sessionWithBotMessage.messages, summaryMessage],
              isComplete: true,
              summary: extractedSummary // ใช้ summary ที่แยกแยะแล้ว
            };

            console.log('📋 ✅ Final session with extracted summary created');
            console.log('📋 ✅ Summary in final session:', finalSession.summary?.substring(0, 100));

            onSessionUpdate(finalSession);
            onChatComplete();
            
            toast.dismiss(summaryToast);
            toast.success('✅ การประเมินอาการเสร็จสิ้น สามารถดูสรุปได้แล้ว');
          } else {
            // Summary ไม่ถูกต้อง - ใช้ fallback
            console.log('📋 ⚠️ Invalid summary received, using fallback');
            throw new Error('Summary ที่ได้รับไม่ถูกต้อง');
          }
          
        } catch (summaryError) {
          console.error('❌ Summary generation failed:', summaryError);
          toast.dismiss(summaryToast);
          
          // แม้ว่าจะสรุปไม่ได้ ก็ยังให้จบการสนทนาด้วย summary พื้นฐาน
          const fallbackMessage: ChatMessage = {
            id: `summary-fallback-${Date.now()}`,
            type: 'bot',
            content: `📋 **การประเมินอาการเสร็จสิ้น**\n\nการสนทนาเสร็จสิ้นแล้ว แต่เกิดข้อผิดพลาดในการสรุป\n\n✅ จำนวนคำถามที่ถาม: ${Math.floor(sessionWithBotMessage.messages.length / 2)} คำถาม\n\n${response.response || 'ขอบคุณสำหรับข้อมูลที่ให้มา'}\n\n❌ Error: ${summaryError instanceof Error ? summaryError.message : 'Unknown error'}`,
            timestamp: new Date()
          };

          const finalSession = {
            ...sessionWithBotMessage,
            messages: [...sessionWithBotMessage.messages, fallbackMessage],
            isComplete: true,
            summary: `สรุปการปรึกษา (Fallback)\n\nการสนทนาเสร็จสิ้นแล้ว แต่ไม่สามารถสร้างสรุปได้\n\nข้อมูลสำคัญ:\n- ${response.response || 'ไม่มีข้อมูลเพิ่มเติม'}`
          };

          onSessionUpdate(finalSession);
          onChatComplete();
          
          toast.error('การสรุปล้มเหลว แต่การประเมินเสร็จสิ้นแล้ว');
        } finally {
          setIsGeneratingSummary(false);
        }

      } else if (response && response.type === 'question') {
        // ยังต้องถามคำถามต่อ
        console.log('❓ Received question type, continuing conversation');
        
        const botMessage: ChatMessage = {
          id: `bot-${Date.now()}`,
          type: 'bot',
          content: response.response || response.question || 'ขอบคุณสำหรับข้อมูล',
          timestamp: new Date()
        };

        const nextSession = {
          ...updatedSession,
          messages: [...updatedSession.messages, botMessage],
          questionCount: Math.floor(updatedSession.messages.length / 2) + 1
        };

        onSessionUpdate(nextSession);
        toast.success(`✅ คำถามที่ ${nextSession.questionCount} - โปรดตอบคำถามต่อไป`);

      } else {
        // กรณีอื่นๆ - แสดงข้อความปกติ
        console.log('⚠️ Unknown response type:', response?.type);
        console.log('⚠️ Full response object:', response);
        
        const botMessage: ChatMessage = {
          id: `bot-${Date.now()}`,
          type: 'bot',
          content: response?.response || response?.message || 'ได้รับข้อมูลแล้ว',
          timestamp: new Date()
        };

        const nextSession = {
          ...updatedSession,
          messages: [...updatedSession.messages, botMessage],
          questionCount: Math.floor(updatedSession.messages.length / 2) + 1
        };

        onSessionUpdate(nextSession);
        toast.success('✅ ได้รับคำตอบจาก AI แล้ว');
      }

    } catch (error) {
      console.error('❌ Chat error:', error);
      toast.dismiss(loadingToast);
      toast.error(error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการส่งข้อความ');
      
      // Remove user message on error
      onSessionUpdate(session);
    } finally {
      setIsLoading(false);
    }
  };

  const getPlaceholderText = () => {
    if (session.isComplete) {
      return 'การสนทนาเสร็จสิ้นแล้ว กรุณาดูสรุป';
    }
    if (session.messages.length === 0) {
      return 'อธิบายอาการที่คุณพบปัญหา...';
    }
    return 'พิมพ์คำตอบของคุณ...';
  };

  const getProgressText = () => {
    const questionCount = Math.floor(session.messages.length / 2);
    if (session.isComplete) {
      return `เสร็จสิ้น (${questionCount} คำถาม)`;
    }
    return `คำถามที่ ${questionCount + 1}`;
  };

  const getCurrentLoadingMessage = () => {
    if (isGeneratingSummary) {
      return 'AI กำลังสรุปการปรึกษา';
    }
    if (session.messages.length === 0) {
      return 'AI กำลังวิเคราะห์อาการเบื้องต้น';
    }
    return 'AI กำลังประมวลผลและสร้างคำถามถัดไป';
  };

  return (
    <div className="flex flex-col h-[600px]">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-gray-200">
        <div>
          <h3 className="text-xl font-semibold text-gray-900">การประเมินอาการ</h3>
          <p className="text-sm text-gray-600">
            ผู้ป่วย: {session.patient.gender === 'male' ? 'ชาย' : 'หญิง'}, อายุ {session.patient.age} ปี
          </p>
          <p className="text-xs text-blue-600 mt-1">{getProgressText()}</p>
          {/* ✅ แก้ไข: แสดง Session ID ให้ถูกต้อง */}
          <p className="text-xs text-gray-500">
            Session: {session.sessionId.substring(0, 8)}...{session.sessionId.slice(-8)}
          </p>
          <p className="text-xs text-gray-400">
            Full ID: {session.sessionId}
          </p>
        </div>
        
        <div className="flex gap-2">
          {/* Test Button - สำหรับทดสอบ generateSummary */}
          <button
            onClick={testSummary}
            className="px-3 py-1 bg-yellow-500 text-white rounded text-xs hover:bg-yellow-600"
            title="ทดสอบ generateSummary API"
          >
            Test Summary
          </button>
          
          {session.isComplete && (
            <button
              onClick={onShowSummary}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors animate-pulse"
            >
              <FileText className="w-4 h-4" />
              ดูสรุป
            </button>
          )}
          <button
            onClick={onReset}
            className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            เริ่มใหม่
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {session.messages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Send className="w-8 h-8 text-blue-500" />
            </div>
            <p className="text-lg font-medium mb-2">เริ่มการปรึกษาครั้งแรก</p>
            <p className="text-sm">กรุณาอธิบายอาการที่คุณกำลังพบปัญหา</p>
            <p className="text-xs text-gray-400 mt-2">
              📋 ระบบจะถามคำถาม 4-7 ข้อ แล้วสรุปผลให้คุณ
            </p>
          </div>
        ) : (
          session.messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))
        )}
        
        {/* Enhanced Loading State - รอนานเท่าไหร่ก็ได้ */}
        {(isLoading || isGeneratingSummary) && (
          <div className="flex flex-col items-center gap-4 p-6 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg border border-blue-200">
            {/* Loading Animation */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <Brain className="w-8 h-8 text-blue-500 animate-pulse" />
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-ping"></div>
              </div>
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
            
            {/* Status Text */}
            <div className="text-center">
              <p className="text-lg font-medium text-gray-800 mb-1">
                🤖 {getCurrentLoadingMessage()}
              </p>
              <p className="text-sm text-gray-600 mb-2">
                {isGeneratingSummary 
                  ? 'กำลังรวบรวมและสรุปข้อมูลทั้งหมด - รอไม่จำกัดเวลา' 
                  : 'กรุณารอ LLM กำลังประมวลผลข้อมูลของคุณ - รอไม่จำกัดเวลา'
                }
              </p>
              
              {/* Timer */}
              <div className="flex items-center justify-center gap-2 text-blue-600">
                <Clock className="w-4 h-4" />
                <span className="font-mono text-sm">
                  เวลาที่ใช้: {formatTime(loadingTime)}
                </span>
              </div>
            </div>
            
            {/* Progress Bar */}
            <div className="w-full max-w-md">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className={`h-full rounded-full animate-pulse ${
                  isGeneratingSummary 
                    ? 'bg-gradient-to-r from-green-500 to-blue-500' 
                    : 'bg-gradient-to-r from-blue-500 to-green-500'
                }`}></div>
              </div>
            </div>
            
            {/* Tips */}
            <div className="text-xs text-gray-500 text-center max-w-md">
              {isGeneratingSummary ? (
                <div>
                  <p>📋 <strong>กำลังสรุป:</strong> AI กำลังวิเคราะห์ข้อมูลทั้งหมดและสร้างสรุป</p>
                  <p className="mt-1 text-blue-600">🔄 ขั้นตอนนี้อาจใช้เวลา 1-5 นาที</p>
                </div>
              ) : (
                <div>
                  <p>💡 <strong>การประมวลผล:</strong> LLM กำลังวิเคราะห์คำตอบของคุณ</p>
                  <p className="mt-1 text-blue-600">⏰ จะรอจนกว่าจะได้คำตอบไม่มีการหมดเวลา</p>
                </div>
              )}
              
              {loadingTime > 60 && (
                <p className="mt-2 text-orange-600">
                  ⏳ การประมวลผลใช้เวลานานกว่าปกติ แต่ระบบยังคงรอต่อไป
                </p>
              )}
              {loadingTime > 180 && (
                <p className="mt-1 text-red-600">
                  🔄 Model กำลังประมวลผลข้อมูลซับซ้อน โปรดอดทนรอต่อไป
                </p>
              )}
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {!session.isComplete && (
        <div className="p-6 border-t border-gray-200">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={getPlaceholderText()}
              disabled={isLoading || isGeneratingSummary}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all disabled:opacity-50 disabled:bg-gray-50"
            />
            <button
              type="submit"
              disabled={isLoading || isGeneratingSummary || !input.trim()}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {(isLoading || isGeneratingSummary) ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </form>
          
          {(isLoading || isGeneratingSummary) && (
            <div className="mt-3 text-center">
              <p className="text-xs text-gray-500">
                ⏰ ระบบจะรอ LLM ไม่จำกัดเวลา คุณสามารถปิดหน้าต่างนี้และกลับมาดูผลลัพธ์ภายหลังได้
              </p>
            </div>
          )}
        </div>
      )}

      {/* Completion State */}
      {session.isComplete && (
        <div className="p-6 border-t border-gray-200 bg-gradient-to-r from-green-50 to-blue-50">
          <div className="text-center">
            <p className="text-green-700 font-medium mb-2">✅ การประเมินอาการเสร็จสิ้น</p>
            <p className="text-sm text-green-600 mb-3">
              ระบบได้ประเมินอาการของคุณเรียบร้อยแล้ว
            </p>
            <button
              onClick={onShowSummary}
              className="inline-flex items-center gap-2 px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors animate-pulse"
            >
              <FileText className="w-5 h-5" />
              ดูสรุปการปรึกษา
            </button>
          </div>
        </div>
      )}
    </div>
  );
}