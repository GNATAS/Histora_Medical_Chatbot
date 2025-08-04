import axios from 'axios';

// Get API base URL from environment variable
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Create axios instance with extended timeout for LLM processing
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 600000, // 10 minutes สำหรับ endpoints ปกติ
  headers: {
    'Content-Type': 'application/json',
  },
});

// Special axios instance for LLM endpoints with unlimited timeout
const llmApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 0, // ไม่มี timeout - รอจนกว่าจะได้คำตอบ
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for both instances
const requestInterceptor = (config: any) => {
  console.log(`🔄 Making ${config.method?.toUpperCase()} request to ${config.url}`);
  return config;
};

const responseInterceptor = (response: any) => {
  console.log(`✅ Response from ${response.config.url}: ${response.status}`);
  return response;
};

const errorInterceptor = (error: any) => {
  console.error('❌ Response error:', error);
  
  if (error.code === 'ECONNABORTED') {
    console.log('⏰ Request timeout - but continuing to wait for LLM...');
    throw new Error('การประมวลผลใช้เวลานานเกินไป - กรุณารอสักครู่');
  }
  
  if (error.response) {
    const message = error.response.data?.detail || error.response.data?.message || 'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์';
    throw new Error(`Server Error (${error.response.status}): ${message}`);
  } else if (error.request) {
    throw new Error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการเชื่อมต่อ');
  } else {
    throw new Error('เกิดข้อผิดพลาดที่ไม่คาดคิด');
  }
};

// Apply interceptors to both instances
api.interceptors.request.use(requestInterceptor);
api.interceptors.response.use(responseInterceptor, errorInterceptor);

llmApi.interceptors.request.use(requestInterceptor);
llmApi.interceptors.response.use(responseInterceptor, errorInterceptor);

// API Functions
export const checkHealth = async () => {
  try {
    const response = await api.get('/health');
    return { status: "healthy", message: "เซิร์ฟเวอร์ทำงานปกติ", ...response.data };
  } catch (error) {
    console.error('Health check failed:', error);
    return { status: "unhealthy", message: "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้" };
  }
};

export const registerPatient = async (patientData: { age: string; gender: string }) => {
  try {
    const response = await api.post('/register_patient', patientData);
    return response.data;
  } catch (error) {
    console.error('Patient registration failed:', error);
    throw error;
  }
};

// ใช้ llmApi สำหรับ LLM endpoints ที่ต้องรอนาน
export const startChat = async (sessionId: string, symptoms: string) => {
  try {
    const formData = new FormData();
    formData.append('session_id', sessionId);
    formData.append('symptoms', symptoms);

    console.log('🤖 Starting chat with LLM - will wait indefinitely...');
    
    const response = await llmApi.post('/start_chat', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 0, // ไม่มี timeout
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          console.log(`📤 Upload progress: ${percentCompleted}%`);
        }
      },
    });
    
    console.log('✅ LLM response received for start_chat');
    return response.data;
  } catch (error) {
    console.error('Start chat failed:', error);
    throw error;
  }
};

export const continueChat = async (sessionId: string, answer: string) => {
  try {
    const formData = new FormData();
    formData.append('session_id', sessionId);
    formData.append('answer', answer);

    console.log('🤖 Continuing chat with LLM - will wait indefinitely...');
    
    const response = await llmApi.post('/continue_chat', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 0, // ไม่มี timeout
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          console.log(`📤 Upload progress: ${percentCompleted}%`);
        }
      },
    });
    
    console.log('✅ LLM response received for continue_chat');
    return response.data;
  } catch (error) {
    console.error('Continue chat failed:', error);
    throw error;
  }
};

// แก้ getSummary ให้ใช้ GET จาก /sessions/{session_id}
export const getSummary = async (sessionId: string) => {
  try {
    console.log(`📋 Getting session data for summary: ${sessionId}`);
    const response = await api.get(`/sessions/${sessionId}`);
    console.log('📋 Session data received:', response.data);
    return response.data; // ส่งข้อมูล session ทั้งหมด
  } catch (error) {
    console.error('Get summary failed:', error);
    throw error;
  }
};

// แก้ generateSummary ให้ใช้ GET method ตาม backend และมี debug logs
export const generateSummary = async (sessionId: string) => {
  try {
    console.log(`📋 Generating summary for session: ${sessionId}`);
    console.log(`📋 Making GET request to: ${API_BASE_URL}/summarize/${sessionId}`);
    
    // ใช้ GET method ตาม backend
    const response = await llmApi.get(`/summarize/${sessionId}`, {
      timeout: 0, // ไม่มี timeout เพราะการสรุปใช้เวลานาน
    });
    
    console.log('✅ Summary API response status:', response.status);
    console.log('✅ Summary API response data:', response.data);
    console.log('✅ Summary generated successfully');
    return response.data;
  } catch (error) {
    console.error('❌ Generate summary failed:', error);
    if (error.response) {
      console.error('❌ Error response status:', error.response.status);
      console.error('❌ Error response data:', error.response.data);
    }
    throw error;
  }
};

export const getSessions = async () => {
  try {
    const response = await api.get('/sessions');
    return response.data;
  } catch (error) {
    console.error('Get sessions failed:', error);
    throw error;
  }
};

export default api;