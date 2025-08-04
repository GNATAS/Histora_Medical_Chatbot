import React from 'react';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';

interface ConnectionStatusProps {
  isConnected: boolean;
  isChecking?: boolean;
}

export default function ConnectionStatus({ isConnected, isChecking }: ConnectionStatusProps) {
  if (isChecking) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded-lg">
        <Loader2 className="w-4 h-4 text-yellow-600 animate-spin" />
        <span className="text-sm font-medium text-yellow-700">กำลังตรวจสอบ...</span>
      </div>
    );
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
        <Wifi className="w-4 h-4 text-green-600" />
        <span className="text-sm font-medium text-green-700">เชื่อมต่อแล้ว</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg">
      <WifiOff className="w-4 h-4 text-red-600" />
      <span className="text-sm font-medium text-red-700">ไม่ได้เชื่อมต่อ</span>
    </div>
  );
}