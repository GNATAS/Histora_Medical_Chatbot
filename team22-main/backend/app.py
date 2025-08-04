from fastapi import FastAPI, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict
import uuid
import sqlite3
import json
import subprocess
from models import MedicalModels

app = FastAPI()

# เพิ่ม CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # ในการใช้งานจริงควรระบุ domain ที่เฉพาะเจาะจง
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# สร้าง SQLite database
DATABASE_PATH = "medical_chat.db"

def init_db():
    """สร้างและเตรียม SQLite database พร้อม migration"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    # สร้างตาราง sessions หรืออัพเดทถ้ามีอยู่แล้ว
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            patient_info TEXT NOT NULL,
            history TEXT NOT NULL,
            question_count INTEGER DEFAULT 0,
            summary TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # ตรวจสอบและเพิ่ม column is_completed ถ้ายังไม่มี
    cursor.execute("PRAGMA table_info(sessions)")
    columns = [column[1] for column in cursor.fetchall()]
    
    if 'is_completed' not in columns:
        print("🔄 Adding is_completed column to existing database...")
        cursor.execute("ALTER TABLE sessions ADD COLUMN is_completed BOOLEAN DEFAULT FALSE")
        print("✅ Database migration completed!")
    else:
        print("✅ Database schema is up to date!")
    
    conn.commit()
    conn.close()
    print(f"✅ SQLite database initialized at: {DATABASE_PATH}")

def get_db_connection():
    """สร้างการเชื่อมต่อ database"""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row  # ให้ return เป็น dict-like object
    return conn

# เริ่มต้น database
init_db()
models = MedicalModels()

@app.on_event("startup")
async def startup_event():
    print("🚀 Starting Medical Chatbot API with SQLite...")
    try:
        # Test database connection
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM sessions")
        count = cursor.fetchone()[0]
        conn.close()
        print(f"✅ Database connection verified. Total sessions: {count}")

        # Load AI models
        print("🤖 Loading AI models...")
        models.load_models()
        print("✅ AI models loaded successfully!")
            
    except Exception as e:
        print(f"❌ Startup error: {e}")

@app.get("/")
async def root():
    return {
        "message": "Medical Chatbot API", 
        "status": "running", 
        "database": "SQLite",
        "database_path": DATABASE_PATH,
        "version": "2.0 - Smart Question System (4-7 questions)"
    }

@app.get("/health")
async def health_check():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM sessions")
        count = cursor.fetchone()[0]
        conn.close()
        return {
            "status": "healthy", 
            "database": "connected", 
            "type": "SQLite",
            "total_sessions": count
        }
    except Exception as e:
        return {"status": "unhealthy", "database": "disconnected", "error": str(e)}

@app.get("/check-gpu")
async def check_gpu():
    try:
        # Run nvidia-smi with query and parse as CSV
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=index,name,memory.total,memory.used,memory.free",
                "--format=csv,noheader,nounits"
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        if result.returncode != 0:
            return {"status": "error", "message": f"nvidia-smi error: {result.stderr}"}

        gpu_info = []
        for line in result.stdout.strip().split("\n"):
            gpu_id, name, total, used, free = line.split(", ")
            gpu_info.append({
                "gpu_id": int(gpu_id),
                "device_name": name,
                "total_memory_mb": int(total),
                "allocated_memory_mb": int(used),
                "free_memory_mb": int(free),
                "cached_memory_mb": None  # Not available from nvidia-smi
            })

        return {"status": "success", "gpus": gpu_info}

    except Exception as e:
        return {"status": "error", "message": f"Failed to retrieve GPU info: {str(e)}"}

class PatientInfo(BaseModel):
    age: str
    gender: str

@app.post("/register_patient")
async def register_patient(info: PatientInfo):
    try:
        session_id = str(uuid.uuid4())
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # ตรวจสอบ schema ก่อนใช้งาน
        cursor.execute("PRAGMA table_info(sessions)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'is_completed' in columns:
            cursor.execute(
                "INSERT INTO sessions (id, patient_info, history, question_count, is_completed) VALUES (?, ?, ?, ?, ?)",
                (session_id, json.dumps(info.dict()), json.dumps([]), 0, False)
            )
        else:
            # Fallback สำหรับ schema เก่า
            cursor.execute(
                "INSERT INTO sessions (id, patient_info, history, question_count) VALUES (?, ?, ?, ?)",
                (session_id, json.dumps(info.dict()), json.dumps([]), 0)
            )
        
        conn.commit()
        conn.close()
        
        print(f"✅ Patient registered with session_id: {session_id}")
        return {"session_id": session_id}
    except Exception as e:
        print(f"❌ Registration error: {e}")
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")

@app.post("/start_chat")
async def start_chat(session_id: str = Form(...), symptoms: str = Form(...)):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
        session_row = cursor.fetchone()
        
        if not session_row:
            conn.close()
            raise HTTPException(status_code=404, detail="ไม่พบ session")
        
        # ตรวจสอบ column is_completed ถ้ามี
        try:
            is_completed = session_row['is_completed'] if 'is_completed' in session_row.keys() else False
            if is_completed:
                conn.close()
                return {"type": "completed", "response": "การสนทนานี้เสร็จสิ้นแล้ว กรุณาใช้ /summarize เพื่อดูสรุป"}
        except (KeyError, IndexError):
            # ถ้าไม่มี column is_completed ให้ข้ามไป
            pass
        
        # แปลงข้อมูลจาก database
        patient_info = json.loads(session_row['patient_info'])
        history = json.loads(session_row['history'])
        question_count = session_row['question_count']
        
        prompt = f"ข้อมูลผู้ป่วย: อายุ {patient_info['age']}, เพศ {patient_info['gender']}. อาการเบื้องต้น: {symptoms}."
        type_, response = models.generate_response(prompt, history)
        
        # อัพเดท history และ question_count
        updated_history = history + [
            {"role": "user", "content": symptoms}, 
            {"role": "assistant", "content": response}
        ]
        new_question_count = question_count + 1 if type_ == "question" else question_count
        is_completed = (type_ == "summary")
        
        # ตรวจสอบ schema ก่อน UPDATE
        cursor.execute("PRAGMA table_info(sessions)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'is_completed' in columns:
            cursor.execute(
                "UPDATE sessions SET history = ?, question_count = ?, is_completed = ? WHERE id = ?",
                (json.dumps(updated_history), new_question_count, is_completed, session_id)
            )
        else:
            cursor.execute(
                "UPDATE sessions SET history = ?, question_count = ? WHERE id = ?",
                (json.dumps(updated_history), new_question_count, session_id)
            )
        
        conn.commit()
        conn.close()
        
        return {"type": type_, "response": response, "question_count": new_question_count}
    except Exception as e:
        print(f"❌ Start chat error: {e}")
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")

@app.post("/continue_chat")
async def continue_chat(session_id: str = Form(...), answer: str = Form(...)):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
        session_row = cursor.fetchone()
        
        if not session_row:
            conn.close()
            raise HTTPException(status_code=404, detail="ไม่พบ session")
        
        # ตรวจสอบ column is_completed ถ้ามี
        try:
            is_completed = session_row['is_completed'] if 'is_completed' in session_row.keys() else False
            if is_completed:
                conn.close()
                return {"type": "completed", "response": "การสนทนานี้เสร็จสิ้นแล้ว กรุณาใช้ /summarize เพื่อดูสรุป"}
        except (KeyError, IndexError):
            # ถ้าไม่มี column is_completed ให้ข้ามไป
            pass
        
        # แปลงข้อมูลจาก database
        history = json.loads(session_row['history'])
        question_count = session_row['question_count']
        
        type_, response = models.generate_response(answer, history)
        
        # อัพเดท history และ question_count
        updated_history = history + [
            {"role": "user", "content": answer}, 
            {"role": "assistant", "content": response}
        ]
        new_question_count = question_count + 1 if type_ == "question" else question_count
        is_completed = (type_ == "summary")
        
        # ตรวจสอบ schema ก่อน UPDATE
        cursor.execute("PRAGMA table_info(sessions)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'is_completed' in columns:
            cursor.execute(
                "UPDATE sessions SET history = ?, question_count = ?, is_completed = ? WHERE id = ?",
                (json.dumps(updated_history), new_question_count, is_completed, session_id)
            )
        else:
            cursor.execute(
                "UPDATE sessions SET history = ?, question_count = ? WHERE id = ?",
                (json.dumps(updated_history), new_question_count, session_id)
            )
        
        conn.commit()
        conn.close()
        
        return {"type": type_, "response": response, "question_count": new_question_count}
    except Exception as e:
        print(f"❌ Continue chat error: {e}")
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")

@app.get("/summarize/{session_id}")
async def summarize(session_id: str):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
        session_row = cursor.fetchone()
        
        if not session_row:
            conn.close()
            raise HTTPException(status_code=404, detail="ไม่พบ session")
        
        # เปลี่ยนเงื่อนไขจาก 4 เป็น 3 เพื่อให้ยืดหยุ่นมากขึ้น
        if session_row['question_count'] < 3:
            conn.close()
            raise HTTPException(status_code=400, detail="ข้อมูลยังไม่พอสำหรับสรุป (ต้องมีอย่างน้อย 3 คำถาม)")
        
        # ตรวจสอบว่ามี summary แล้วหรือไม่
        if session_row['summary']:
            conn.close()
            return {"summary": session_row['summary'], "from_cache": True}
        
        # สร้าง summary ใหม่
        history = json.loads(session_row['history'])
        patient_info = json.loads(session_row['patient_info'])
        
        # เพิ่มข้อมูลผู้ป่วยในการสรุป
        summary_prompt = f"ข้อมูลผู้ป่วย: อายุ {patient_info['age']}, เพศ {patient_info['gender']}. สรุปอาการจากประวัติทั้งหมด: " + " ".join([msg['content'] for msg in history])
        _, summary = models.generate_response(summary_prompt, history)
        
        # บันทึก summary
        cursor.execute("PRAGMA table_info(sessions)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'is_completed' in columns:
            cursor.execute("UPDATE sessions SET summary = ?, is_completed = ? WHERE id = ?", (summary, True, session_id))
        else:
            cursor.execute("UPDATE sessions SET summary = ? WHERE id = ?", (summary, session_id))
        
        conn.commit()
        conn.close()
        
        return {"summary": summary, "from_cache": False}
    except Exception as e:
        print(f"❌ Summarize error: {e}")
        raise HTTPException(status_code=500, detail=f"Summary error: {str(e)}")

@app.get("/sessions")
async def list_sessions():
    """ดูรายการ sessions ทั้งหมด"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # ตรวจสอบ schema
        cursor.execute("PRAGMA table_info(sessions)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'is_completed' in columns:
            cursor.execute("SELECT id, patient_info, question_count, is_completed, created_at FROM sessions ORDER BY created_at DESC")
        else:
            cursor.execute("SELECT id, patient_info, question_count, created_at FROM sessions ORDER BY created_at DESC")
            
        sessions_rows = cursor.fetchall()
        conn.close()
        
        sessions = []
        for row in sessions_rows:
            session_data = {
                "session_id": row['id'],
                "patient_info": json.loads(row['patient_info']),
                "question_count": row['question_count'],
                "created_at": row['created_at']
            }
            
            # เพิ่ม is_completed ถ้ามี
            if 'is_completed' in row.keys():
                session_data["is_completed"] = bool(row['is_completed'])
            else:
                session_data["is_completed"] = False
                
            sessions.append(session_data)
        
        return {"sessions": sessions, "count": len(sessions)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching sessions: {str(e)}")

@app.get("/sessions/{session_id}")
async def get_session(session_id: str):
    """ดูข้อมูล session เฉพาะ"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
        session_row = cursor.fetchone()
        conn.close()
        
        if not session_row:
            raise HTTPException(status_code=404, detail="ไม่พบ session")
        
        session_data = {
            "session_id": session_row['id'],
            "patient_info": json.loads(session_row['patient_info']),
            "history": json.loads(session_row['history']),
            "question_count": session_row['question_count'],
            "summary": session_row['summary'],
            "created_at": session_row['created_at']
        }
        
        # เพิ่ม is_completed ถ้ามี
        if 'is_completed' in session_row.keys():
            session_data["is_completed"] = bool(session_row['is_completed'])
        else:
            session_data["is_completed"] = False
        
        return {"session": session_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching session: {str(e)}")

@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """ลบ session"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        
        if cursor.rowcount == 0:
            conn.close()
            raise HTTPException(status_code=404, detail="ไม่พบ session")
        
        conn.commit()
        conn.close()
        
        return {"message": "ลบ session สำเร็จ", "session_id": session_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting session: {str(e)}")

# เพิ่ม endpoint สำหรับบังคับสรุป
@app.post("/force_summarize/{session_id}")
async def force_summarize(session_id: str):
    """บังคับสรุปทันที แม้ว่าจะยังไม่ครบจำนวนคำถาม"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
        session_row = cursor.fetchone()
        
        if not session_row:
            conn.close()
            raise HTTPException(status_code=404, detail="ไม่พบ session")
        
        if session_row['question_count'] < 1:
            conn.close()
            raise HTTPException(status_code=400, detail="ต้องมีการสนทนาอย่างน้อย 1 รอบ")
        
        # สร้าง summary
        history = json.loads(session_row['history'])
        patient_info = json.loads(session_row['patient_info'])
        
        summary_prompt = f"ข้อมูลผู้ป่วย: อายุ {patient_info['age']}, เพศ {patient_info['gender']}. สรุปอาการจากประวัติที่มี (บังคับสรุป): " + " ".join([msg['content'] for msg in history])
        _, summary = models.generate_response(summary_prompt, history)
        
        # บันทึก summary และ mark เป็น completed
        cursor.execute("PRAGMA table_info(sessions)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'is_completed' in columns:
            cursor.execute("UPDATE sessions SET summary = ?, is_completed = ? WHERE id = ?", (summary, True, session_id))
        else:
            cursor.execute("UPDATE sessions SET summary = ? WHERE id = ?", (summary, session_id))
        
        conn.commit()
        conn.close()
        
        return {"summary": summary, "forced": True}
    except Exception as e:
        print(f"❌ Force summarize error: {e}")
        raise HTTPException(status_code=500, detail=f"Force summary error: {str(e)}")

# เพิ่ม endpoint สำหรับ debug database schema
@app.get("/debug/schema")
async def debug_schema():
    """ดู schema ของ database สำหรับ debug"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(sessions)")
        columns = cursor.fetchall()
        conn.close()
        
        return {
            "table": "sessions",
            "columns": [{"name": col[1], "type": col[2], "nullable": not col[3], "default": col[4]} for col in columns]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching schema: {str(e)}")