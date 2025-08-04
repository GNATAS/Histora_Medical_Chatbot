import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { getSummary } from '../services/api';
import { ArrowLeft, FileText, Download, RotateCcw, Loader2, Clock, User, CheckCircle } from 'lucide-react';

interface SummaryDisplayProps {
  sessionId: string;
  onBack: () => void;
  onReset: () => void;
  sessionSummary?: string;
}

export default function SummaryDisplay({ sessionId, onBack, onReset, sessionSummary }: SummaryDisplayProps) {
  const [summary, setSummary] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSummary();
  }, [sessionId]);

  // ฟังก์ชันแยกแยะ summary ที่ซับซ้อน
  const extractSummaryText = (data: any): string => {
    console.log('🔍 Extracting summary from:', data);

    // กรณีที่ 1: มี summary ตรงๆ
    if (data && typeof data.summary === 'string' && data.summary !== 'ยังไม่มีการสรุป') {
      console.log('✅ Found direct summary string');
      return data.summary;
    }

    // กรณีที่ 2: summary เป็น object ที่มี indexed characters
    if (data && data.summary && typeof data.summary === 'object') {
      console.log('🔍 Summary is object, trying to reconstruct...');

      // ลองรวม indexed characters
      const keys = Object.keys(data.summary).filter(key => !isNaN(Number(key)));
      if (keys.length > 0) {
        keys.sort((a, b) => Number(a) - Number(b));
        const reconstructed = keys.map(key => data.summary[key]).join('');
        console.log('🔧 Reconstructed summary:', reconstructed);

        // ตรวจสอบว่าเป็น HTML หรือไม่
        if (reconstructed.includes('<html') || reconstructed.includes('<!DOCTYPE')) {
          console.log('⚠️ Summary is HTML, trying to extract text...');
          // แยก text จาก HTML
          const textContent = reconstructed.replace(/<[^>]*>/g, '').trim();
          return textContent || 'ไม่สามารถแยกข้อความจาก HTML ได้';
        }

        return reconstructed;
      }
    }

    // กรณีที่ 3: ใช้ sessionSummary จาก ChatInterface
    if (sessionSummary && sessionSummary !== 'ยังไม่มีการสรุป') {
      console.log('✅ Using sessionSummary from ChatInterface');
      return sessionSummary;
    }

    // กรณีที่ 4: ลองหาใน fields อื่นๆ
    if (data) {
      const possibleFields = ['response', 'content', 'text', 'message'];
      for (const field of possibleFields) {
        if (data[field] && typeof data[field] === 'string' && data[field].length > 10) {
          console.log(`✅ Found summary in field: ${field}`);
          return data[field];
        }
      }
    }

    console.log('❌ No valid summary found');
    return 'ไม่พบข้อมูลสรุป';
  };

  const loadSummary = async () => {
    try {
      setIsLoading(true);
      console.log('📋 Loading summary for session:', sessionId);

      // ดึงข้อมูล session จาก backend
      const sessionData = await getSummary(sessionId);
      console.log('📋 Session data received:', sessionData);

      // Backend response อาจเป็น { session: {...} } หรือ {...} โดยตรง
      const actualSessionData = sessionData.session || sessionData;
      console.log('📋 Actual session data:', actualSessionData);

      // แยกแยะ summary ที่ซับซ้อน
      const finalSummary = extractSummaryText(actualSessionData);

      setSummary({
        ...actualSessionData,
        summary: finalSummary
      });

      console.log('📋 Final summary data:', { ...actualSessionData, summary: finalSummary });

    } catch (error) {
      console.error('Failed to load summary:', error);
      toast.error('ไม่สามารถโหลดข้อมูล session ได้');

      // Fallback: ใช้ sessionSummary ถ้ามี
      if (sessionSummary) {
        const fallbackSummary = extractSummaryText({ summary: sessionSummary });
        setSummary({
          id: sessionId,
          session_id: sessionId,
          summary: fallbackSummary,
          created_at: new Date().toISOString(),
          patient_info: null,
          history: []
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (!summary) return;

    const content = `
สรุปการปรึกษาทางการแพทย์
=======================

Session ID: ${sessionId}
วันที่: ${new Date().toLocaleDateString('th-TH')}
เวลา: ${new Date().toLocaleTimeString('th-TH')}

ข้อมูลผู้ป่วย:
${summary.patient_info ?
        `อายุ: ${summary.patient_info.age} ปี, เพศ: ${summary.patient_info.gender === 'male' ? 'ชาย' : 'หญิง'}` :
        'ไม่มีข้อมูล'
      }

ประวัติการสนทนา:
${summary.history && summary.history.length > 0 ?
        summary.history.map((msg: any, index: number) =>
          `${index + 1}. ${msg.role === 'user' ? 'ผู้ป่วย' : 'แพทย์'}: ${msg.content}`
        ).join('\n') : 'ไม่มีข้อมูลการสนทนา'
      }

สรุปทางการแพทย์:
${summary.summary || 'ไม่พบข้อมูลสรุป'}

หมายเหตุ: นี่เป็นการประเมินเบื้องต้นด้วย AI ควรปรึกษาแพทย์เพื่อการวินิจฉัยและรักษาที่ถูกต้อง
    `.trim();

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medical-summary-${sessionId.slice(-8)}-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    toast.success('ดาวน์โหลดสรุปสำเร็จ');
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
              <p className="text-gray-600">กำลังโหลดข้อมูล session...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const summaryText = summary?.summary || 'ไม่พบข้อมูลสรุป';

  return (

    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 text-gray-700 hover:text-blue-600 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">สรุปการปรึกษา</h2>
              <p className="text-gray-600">ผลการประเมินอาการและข้อเสนอแนะ</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              <Download className="w-4 h-4" />
              ดาวน์โหลด
            </button>
            <button
              onClick={onReset}
              className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              เริ่มใหม่
            </button>
          </div>
        </div>

        {/* Summary Content */}
        <div className="space-y-6">
          {/* Success Banner */}
          <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <h3 className="text-lg font-semibold text-green-900">การประเมินเสร็จสิ้น</h3>
            </div>
            <p className="text-green-700">
              ระบบ AI ได้ประมวลผลข้อมูลของคุณเรียบร้อยแล้ว โปรดอ่านสรุปด้านล่างและปรึกษาแพทย์เพื่อการรักษาที่เหมาะสม
            </p>
          </div>

          {/* Session Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-blue-900">ข้อมูลเซสชัน</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-blue-600" />
                <span className="text-gray-700">
                  {summary?.patient_info ?
                    `${summary.patient_info.gender === 'male' ? 'ชาย' : 'หญิง'}, อายุ ${summary.patient_info.age} ปี` :
                    'ข้อมูลผู้ป่วย'
                  }
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span className="text-gray-700">
                  {summary?.created_at ?
                    new Date(summary.created_at).toLocaleDateString('th-TH') :
                    new Date().toLocaleDateString('th-TH')
                  }
                </span>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                {/* ✅ แก้ไข: แสดง Session ID ให้ถูกต้อง */}
                <span className="text-gray-700">Session: {sessionId.substring(0, 8)}...{sessionId.slice(-8)}</span>
              </div>
            </div>
            {/* เพิ่ม Full Session ID สำหรับ debug */}
            <div className="mt-2 text-xs text-gray-500">
              <strong>Full Session ID:</strong> {sessionId}
            </div>
          </div>

          {/* Chat History */}
          {summary?.history && summary.history.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">ประวัติการสนทนา</h3>
              <div className="space-y-4 max-h-60 overflow-y-auto">
                {summary.history.map((msg: any, index: number) => (
                  <div key={index} className={`p-3 rounded-lg ${msg.role === 'user' ? 'bg-blue-50 ml-8' : 'bg-gray-50 mr-8'
                    }`}>
                    <div className="text-xs text-gray-500 mb-1">
                      {msg.role === 'user' ? 'ผู้ป่วย' : 'แพทย์ AI'}
                    </div>
                    <p className="text-sm text-gray-800">{msg.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Medical Summary - Main Content */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-green-900 mb-4">📋 สรุปทางการแพทย์</h3>
            <div className="prose prose-sm max-w-none">
              <div className="whitespace-pre-wrap text-gray-800 leading-relaxed bg-white p-4 rounded border">
                {summaryText}
              </div>
            </div>
          </div>

          {/* Summary Status */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="font-semibold text-yellow-800 mb-2">📊 สถานะสรุป</h4>
            <div className="text-sm text-yellow-700">
              <p><strong>ความยาวสรุป:</strong> {summaryText.length} ตัวอักษร</p>
              <p><strong>แหล่งที่มา:</strong> {summaryText === sessionSummary ? 'จาก ChatInterface' : 'จาก Backend'}</p>
              <p><strong>สถานะ:</strong> {summaryText.includes('ไม่พบ') || summaryText.includes('ยังไม่มี') ? '❌ ไม่สำเร็จ' : '✅ สำเร็จ'}</p>
              <p><strong>Session ID:</strong> {sessionId}</p>
            </div>
          </div>

          {/* Debug Info - สำหรับ development */}
          {true && ( // เปิด debug เสมอเพื่อตรวจสอบ
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold text-gray-800 mb-2">🔍 Debug Info</h4>
              <details className="text-xs text-gray-600">
                <summary className="cursor-pointer font-medium mb-2">Click to expand debug data</summary>
                <pre className="whitespace-pre-wrap bg-gray-100 p-2 rounded overflow-auto max-h-40">
                  {JSON.stringify({
                    sessionId,
                    sessionSummary,
                    summary,
                    extractedSummary: summaryText
                  }, null, 2)}
                </pre>
              </details>
            </div>
          )}

          {/* Next Steps */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h4 className="font-semibold text-blue-800 mb-3">📋 ขั้นตอนต่อไป</h4>
            <ul className="text-sm text-blue-700 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span>นำสรุปนี้ไปแสดงแพทย์เพื่อการตรวจวินิจฉัยที่แม่นยำ</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span>ติดตามอาการและบันทึกการเปลี่ยนแปลง</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span>หากมีอาการฉุกเฉิน ให้รีบไปพบแพทย์ทันที</span>
              </li>
            </ul>
          </div>

          {/* Disclaimer */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h4 className="font-semibold text-yellow-800 mb-2">⚠️ ข้อควรระวัง</h4>
            <p className="text-sm text-yellow-700 leading-relaxed">
              การประเมินนี้เป็นเพียงข้อมูลเบื้องต้นจากระบบ AI เท่านั้น ไม่สามารถใช้แทนการวินิจฉัยของแพทย์ได้
              หากมีอาการผิดปกติหรือกังวลเกี่ยวกับสุขภาพ กรุณาปรึกษาแพทย์ผู้เชี่ยวชาญโดยเร็วที่สุด
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}