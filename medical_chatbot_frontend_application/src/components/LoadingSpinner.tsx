import React from 'react';
import { Brain, Loader2, Clock } from 'lucide-react';

interface LoadingSpinnerProps {
  message?: string;
  duration?: number;
  showTips?: boolean;
}

export default function LoadingSpinner({ 
  message = "AI กำลังประมวลผล...", 
  duration = 0,
  showTips = false 
}: LoadingSpinnerProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
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
          🤖 {message}
        </p>
        <p className="text-sm text-gray-600 mb-2">
          กรุณารอสักครู่ LLM กำลังประมวลผลข้อมูลของคุณ
        </p>
        
        {/* Timer */}
        {duration > 0 && (
          <div className="flex items-center justify-center gap-2 text-blue-600">
            <Clock className="w-4 h-4" />
            <span className="font-mono text-sm">
              เวลาที่ใช้: {formatTime(duration)}
            </span>
          </div>
        )}
      </div>
      
      {/* Progress Bar */}
      <div className="w-full max-w-md">
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full animate-pulse"></div>
        </div>
      </div>
      
      {/* Tips */}
      {showTips && (
        <div className="text-xs text-gray-500 text-center max-w-md">
          <p>💡 <strong>เกร็ดความรู้:</strong> AI ใช้เวลาประมาณ 30 วินาที - 3 นาที ในการวิเคราะห์</p>
          {duration > 30 && (
            <p className="mt-1 text-orange-600">
              ⏳ การประมวลผลใช้เวลานานกว่าปกติ กรุณาอดทนรอสักครู่
            </p>
          )}
          {duration > 120 && (
            <p className="mt-1 text-red-600">
              🔄 Model กำลังประมวลผลข้อมูลซับซ้อน โปรดอดทนรอต่อไป
            </p>
          )}
        </div>
      )}
    </div>
  );
}