import React, { useState } from 'react';
import { toast } from 'sonner';
import { registerPatient } from '../services/api';
import { User, Calendar, Users, ArrowRight, Loader2 } from 'lucide-react';

interface PatientRegistrationProps {
  onPatientRegistered: (patient: { age: string; gender: string }, sessionId: string) => void;
  isConnected: boolean;
}

export default function PatientRegistration({ onPatientRegistered, isConnected }: PatientRegistrationProps) {
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!age || !gender) {
      toast.error('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    if (!isConnected) {
      toast.error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง');
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await registerPatient({ age, gender });
      
      if (response.session_id) {
        onPatientRegistered({ age, gender }, response.session_id);
        toast.success('ลงทะเบียนสำเร็จ');
      } else {
        throw new Error('ไม่ได้รับ session ID จากเซิร์ฟเวอร์');
      }
    } catch (error) {
      console.error('Registration failed:', error);
      toast.error(error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการลงทะเบียน');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">ลงทะเบียนผู้ป่วย</h2>
          <p className="text-gray-600">กรุณากรอกข้อมูลเบื้องต้นเพื่อเริ่มการประเมินอาการ</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Age Input */}
          <div>
            <label htmlFor="age" className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <Calendar className="w-4 h-4" />
              อายุ (ปี)
            </label>
            <input
              type="number"
              id="age"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              min="1"
              max="120"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              placeholder="กรุณาใส่อายุของคุณ"
              required
            />
          </div>

          {/* Gender Selection */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
              <Users className="w-4 h-4" />
              เพศ
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setGender('male')}
                className={`p-4 border-2 rounded-lg text-center transition-all ${
                  gender === 'male'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                <div className="font-medium">ชาย</div>
                <div className="text-sm opacity-75">Male</div>
              </button>
              <button
                type="button"
                onClick={() => setGender('female')}
                className={`p-4 border-2 rounded-lg text-center transition-all ${
                  gender === 'female'
                    ? 'border-pink-500 bg-pink-50 text-pink-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                <div className="font-medium">หญิง</div>
                <div className="text-sm opacity-75">Female</div>
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading || !isConnected}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-green-500 text-white font-medium py-3 px-6 rounded-lg hover:from-blue-600 hover:to-green-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                กำลังลงทะเบียน...
              </>
            ) : (
              <>
                เริ่มการปรึกษา
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        {/* Connection Warning */}
        {!isConnected && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700 text-center">
              ⚠️ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการเชื่อมต่อ
            </p>
          </div>
        )}
      </div>
    </div>
  );
}