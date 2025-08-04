import os
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer,BitsAndBytesConfig
from typing import Tuple, List, Dict
from dotenv import load_dotenv
import re

load_dotenv()
HF_TOKEN = os.getenv('HF_TOKEN')

class MedicalModels():
    def __init__(self):
        self.model = None
        self.tokenizer = None
        self.device = None

    def load_models(self, quantization_bits: int = 4):
        quantization_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_use_double_quant=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16
        )
        try:
            model_name = "scb10x/typhoon2.1-gemma3-12b"
            print(f"🤖 Loading model: {model_name} with {quantization_bits}-bit quantization")

            # Load tokenizer
            self.tokenizer = AutoTokenizer.from_pretrained(
                model_name,
                trust_remote_code=True,
                token=HF_TOKEN
            )
            
            self.model = AutoModelForCausalLM.from_pretrained(
                model_name,
                trust_remote_code=True,
                torch_dtype=torch.bfloat16,
                device_map="auto",
                low_cpu_mem_usage=True,
                quantization_config=quantization_config,
                token=HF_TOKEN
            )

            # Store device
            self.device = next(self.model.parameters()).device
            #print(f"✅ Model loaded with device_map='auto', float16, and {quantization_bits}-bit quantization!")
            print(f"🎯 Model device: {self.device}")
            print(f"🎯 Model device info: {self.model.hf_device_map}")
    
        except Exception as e:
            print(f"❌ Error loading SeaLLM model with quantization: {e}")
            self.model = None
            self.tokenizer = None
            self.device = None

    def generate_response(self, prompt: str, history: List[Dict[str, str]]) -> Tuple[str, str]:
        """Generate response using LLM only - no predefined questions"""
        prompt = self._fix_thai_encoding(prompt)
        question_count = len([msg for msg in history if msg['role'] == 'assistant'])

        try:
            # ตรวจสอบว่าควรสรุปหรือถามต่อ
            if question_count >= 4:
                # ใช้ AI ตัดสินใจว่าควรถามต่อหรือสรุป
                should_summarize = self._should_summarize(prompt, history, question_count)
                if should_summarize or question_count >= 7:
                    summary = self._generate_medical_summary(prompt, history)
                    return "summary", summary
            
            # ถามคำถามต่อไป (ใช้ LLM เท่านั้น)
            question = self._generate_intelligent_question(prompt, history)
            return "question", question
            
        except Exception as e:
            print(f"❌ Error generating response: {e}")
            # ไม่ fallback ไป predefined questions แล้ว
            raise Exception(f"ไม่สามารถสร้างคำถามได้: {str(e)}")

    def _should_summarize(self, prompt: str, history: List[Dict[str, str]], question_count: int) -> bool:
        """ตัดสินใจว่าควรสรุปหรือถามต่อ โดยใช้ AI วิเคราะห์"""
        if question_count < 4:
            return False
        if question_count >= 7:
            return True
        
        # ต้องมี model เพื่อตัดสินใจ
        if self.model is None or self.tokenizer is None:
            print("⚠️ Model not available for summarization decision")
            # ถ้าไม่มี model ให้ถามต่อจนครบ 6 คำถาม
            return question_count >= 6
        
        try:
            context = self._build_medical_context(prompt, history)
            evaluation_prompt = f"""<|im_start|>system
คุณเป็นแพทย์ที่ต้องตัดสินใจว่าได้ข้อมูลเพียงพอสำหรับการวินิจฉัยเบื้องต้นแล้วหรือไม่

ตอบเพียง "พอ" หรือ "ไม่พอ" เท่านั้น

เกณฑ์การตัดสินใจ:
- มีข้อมูลอาการหลักชัดเจน
- ทราบระยะเวลาและลักษณะของอาการ
- มีข้อมูลปัจจัยที่เกี่ยวข้อง
- สามารถประเมินความรุนแรงได้
- มีข้อมูลประวัติการรักษาเบื้องต้น<|im_end|>
<|im_start|>user
{context}<|im_end|>
<|im_start|>assistant"""

            inputs = self.tokenizer(evaluation_prompt, return_tensors="pt", max_length=1024, truncation=True)
            
            # แก้ไข device mismatch
            inputs = {k: v.to(self.device) for k, v in inputs.items()}
            
            with torch.no_grad():
                outputs = self.model.generate(**inputs, max_new_tokens=10, temperature=0.3)
            response = self.tokenizer.decode(outputs[0], skip_special_tokens=True)
            result = response[len(evaluation_prompt):].strip()
            
            decision = "พอ" in result
            print(f"🤖 LLM Summarization Decision: {'Summarize' if decision else 'Continue'} (Question #{question_count})")
            return decision
            
        except Exception as e:
            print(f"❌ Error in summarization decision: {e}")
            # ถ้า error ให้ถามต่อจนครบ 6 คำถาม
            return question_count >= 6

    def _generate_intelligent_question(self, prompt: str, history: List[Dict[str, str]]) -> str:
        """ใช้ LLM สร้างคำถามเท่านั้น - ไม่มี fallback"""
        
        # ตรวจสอบว่า model พร้อมใช้งานหรือไม่
        if self.model is None or self.tokenizer is None:
            raise Exception("Model ไม่พร้อมใช้งาน ไม่สามารถสร้างคำถามได้")
        
        print("🤖 Generating question using LLM only...")
        
        # วิเคราะห์บริบทและสร้างคำถาม
        context = self._build_medical_context(prompt, history)
        question_count = len([msg for msg in history if msg['role'] == 'assistant'])
        
        medical_prompt = f"""<|im_start|>system
คุณเป็นแพทย์ที่มีประสบการณ์ในการซักประวัติผู้ป่วย คุณต้องถามคำถามที่เหมาะสมเพื่อรวบรวมข้อมูลสำหรับการวินิจฉัย

หลักการซักประวัติ OPQRST + PMH:
1. Onset (เริ่มต้น) - เมื่อไหร่ อย่างไร
2. Provocation/Palliation (ปัจจัยกระตุ้น/บรรเทา) - อะไรทำให้แย่/ดีขึ้น
3. Quality (ลักษณะ) - รู้สึกเป็นอย่างไร ปวดแบบไหน
4. Region/Radiation (ตำแหน่ง/การแพร่) - ที่ไหน แพร่ไปไหนบ้าง
5. Severity (ความรุนแรง) - มากน้อยแค่ไหน
6. Timing (เวลา) - เมื่อไหร่ นานแค่ไหน ถี่แค่ไหน
7. Associated symptoms (อาการร่วม) - มีอาการอื่นด้วยไหม
8. Past Medical History (ประวัติ) - โรคเก่า ยา แพ้อะไร

กฎสำคัญ:
- ถามคำถามภาษาไทยเพียง 1 ข้อ ที่เจาะจง
- อย่าถามซ้ำกับที่เคยถามแล้ว
- คำถามต้องสั้น กระชับ และง่ายต่อการเข้าใจ
- ต้องเป็นคำถามที่ช่วยในการวินิจฉัย
- ต้องมีคำถาม (?, ไหม, หรือ ฯลฯ)

ตัวอย่างคำถามที่ดี:
- "อาการปวดหัวนี้เป็นแบบตุบๆ หรือปวดต่อเนื่องครับ?"
- "ไข้ขึ้นในช่วงเวลาไหนบ้างครับ? ตอนเช้าหรือเย็น?"
- "มีอาการคลื่นไส้ อาเจียนด้วยไหมครับ?"<|im_end|>
<|im_start|>user
{context}

นี่เป็นคำถามที่ {question_count + 1} แล้ว โปรดถามคำถามที่เหมาะสมต่อไป<|im_end|>
<|im_start|>assistant"""

        max_retries = 3
        for retry in range(max_retries):
            try:
                inputs = self.tokenizer(
                    medical_prompt,
                    return_tensors="pt",
                    max_length=1200,
                    truncation=True
                )
                
                # แก้ไข device mismatch
                inputs = {k: v.to(self.device) for k, v in inputs.items()}
                print(f"🔧 Input device: {inputs['input_ids'].device}, Model device: {self.device}")
                
                with torch.no_grad():
                    outputs = self.model.generate(
                        **inputs,
                        max_new_tokens=100,
                        num_return_sequences=1,
                        temperature=0.8 + (retry * 0.1),  # เพิ่ม temperature ถ้า retry
                        do_sample=True,
                        pad_token_id=self.tokenizer.eos_token_id,
                        eos_token_id=self.tokenizer.eos_token_id,
                        repetition_penalty=1.2,
                        top_p=0.9,
                        top_k=50
                    )
                
                response = self.tokenizer.decode(outputs[0], skip_special_tokens=True)
                question = response[len(medical_prompt):].strip()
                
                # ทำความสะอาดคำตอบ
                question = self._clean_medical_response(question)
                
                print(f"🤖 LLM Generated Question (Attempt {retry + 1}): {question}")
                
                # ตรวจสอบคุณภาพคำถาม
                if self._is_valid_medical_question(question):
                    print("✅ Using LLM generated question")
                    return question
                else:
                    print(f"⚠️ Question quality check failed (Attempt {retry + 1})")
                    if retry == max_retries - 1:
                        raise Exception("ไม่สามารถสร้างคำถามที่มีคุณภาพได้หลังจากพยายาม 3 ครั้ง")
                    
            except Exception as e:
                print(f"❌ Error generating question (Attempt {retry + 1}): {e}")
                if retry == max_retries - 1:
                    raise Exception(f"ไม่สามารถสร้างคำถามได้หลังจากพยายาม {max_retries} ครั้ง: {str(e)}")

    def _generate_medical_summary(self, prompt: str, history: List[Dict[str, str]]) -> str:
        """สร้างสรุปทางการแพทย์สำหรับหมอ"""
        
        # ต้องมี model เพื่อสร้างสรุป
        if self.model is None or self.tokenizer is None:
            print("⚠️ Model not available, using structured summary")
            return self._generate_structured_summary(history)
        
        try:
            print("🤖 Generating summary using LLM...")
            
            # รวบรวมข้อมูลทั้งหมด
            patient_data = self._extract_comprehensive_data(history)
            
            summary_prompt = f"""<|im_start|>system
คุณเป็นแพทย์ที่ต้องสรุปข้อมูลผู้ป่วยให้แพทย์ผู้เชี่ยวชาญในการวินิจฉัย

โปรดสรุปข้อมูลในรูปแบบมาตรฐานทางการแพทย์:

1. **Chief Complaint (CC):** อาการหลักที่ผู้ป่วยมาพบ
2. **History of Present Illness (HPI):** ประวัติอาการปัจจุบันแบบละเอียด
3. **Associated Symptoms:** อาการร่วมที่สำคัญ
4. **Duration & Progression:** ระยะเวลาและการพัฒนาของโรค
5. **Aggravating/Relieving Factors:** ปัจจัยที่ทำให้แย่/ดีขึ้น
6. **Past Medical History (PMH):** ประวัติการรักษา ยา แพ้ยา
7. **Clinical Impression:** ความเห็นเบื้องต้น
8. **Recommendation:** ข้อเสนอแนะการดำเนินการต่อ

ใช้ภาษาไทยในการสรุป เขียนให้กระชับ ชัดเจน และเป็นประโยชน์ต่อแพทย์ที่จะรับต่อ<|im_end|>
<|im_start|>user
{patient_data}<|im_end|>
<|im_start|>assistant"""

            inputs = self.tokenizer(
                summary_prompt,
                return_tensors="pt",
                max_length=1200,
                truncation=True
            )
            
            # แก้ไข device mismatch
            inputs = {k: v.to(self.device) for k, v in inputs.items()}
            
            with torch.no_grad():
                outputs = self.model.generate(
                    **inputs,
                    max_new_tokens=2048,
                    temperature=0.7,
                    do_sample=True,
                    pad_token_id=self.tokenizer.eos_token_id,
                    repetition_penalty=1.1,
                    top_p=0.9
                )
            
            response = self.tokenizer.decode(outputs[0], skip_special_tokens=True)
            summary = response[len(summary_prompt):].strip()
            
            # ทำความสะอาดสรุป
            summary = self._clean_medical_response(summary)
            
            print(f"🤖 LLM Generated Summary Length: {len(summary)} characters")
            
            if len(summary) > 150:
                print("✅ Using LLM generated summary")
                return summary
            else:
                print("⚠️ LLM summary too short, using structured")
                return self._generate_structured_summary(history)
                
        except Exception as e:
            print(f"❌ Error generating summary with LLM: {e}")
            print("🔄 Using structured summary as fallback")
            return self._generate_structured_summary(history)

    def _fix_thai_encoding(self, text: str) -> str:
        try:
            if 'à¸' in text:
                text = text.encode('latin1').decode('utf-8')
            return text
        except:
            return text

    def _build_medical_context(self, current_prompt: str, history: List[Dict[str, str]]) -> str:
        context = "ประวัติการซักถาม:\n"
        for i, msg in enumerate(history):
            if msg['role'] == 'user':
                context += f"ผู้ป่วยตอบ: {msg['content']}\n"
            else:
                context += f"แพทย์ถาม: {msg['content']}\n"
        context += f"ผู้ป่วยตอบล่าสุด: {current_prompt}\n"
        context += "\nโปรดวิเคราะห์ข้อมูลที่มีและถามคำถามต่อไปที่เหมาะสม:"
        return context

    def _extract_comprehensive_data(self, history: List[Dict[str, str]]) -> str:
        user_responses = [msg['content'] for msg in history if msg['role'] == 'user']
        doctor_questions = [msg['content'] for msg in history if msg['role'] == 'assistant']
        
        data = f"""ข้อมูลที่รวบรวมได้จากการซักประวัติ:
จำนวนคำถามที่ถาม: {len(doctor_questions)} คำถาม
จำนวนคำตอบที่ได้รับ: {len(user_responses)} คำตอบ

รายละเอียดการสนทนาทั้งหมด:
"""
        for i, (question, answer) in enumerate(zip(doctor_questions, user_responses), 1):
            data += f"\nคำถามที่ {i}: {question}\nคำตอบ: {answer}\n"
        
        return data

    def _clean_medical_response(self, response: str) -> str:
        # ลบ special tokens
        tokens_to_remove = [
            '<|im_start|>', '<|im_end|>', '<|endoftext|>', '</s>', '<s>', 
            '<|im_start|>assistant', '<|im_start|>user', '<|im_start|>system'
        ]
        for token in tokens_to_remove:
            response = response.replace(token, '')
        
        # ลบ newlines ที่เกิน
        response = re.sub(r'\n+', '\n', response)
        response = response.strip()
        
        # ลบส่วนที่ซ้ำกับ prompt
        if 'ผู้ป่วยตอบ:' in response:
            response = response.split('ผู้ป่วยตอบ:')[0].strip()
        
        # ตัดส่วนที่เป็นคำอธิบายเพิ่มเติมออก
        if 'เพราะ' in response and len(response.split('เพราะ')[0]) > 10:
            response = response.split('เพราะ')[0].strip()
        
        # จำกัดความยาว
        if len(response) > 500:
            response = response[:500] + "..."
        
        return response

    def _is_valid_medical_question(self, text: str) -> bool:
        if not text or len(text) < 15:
            print(f"❌ Question too short: {len(text)} chars")
            return False
        
        thai_chars = sum(1 for c in text if '\u0e00' <= c <= '\u0e7f')
        if thai_chars < 8:
            print(f"❌ Not enough Thai characters: {thai_chars}")
            return False
        
        question_indicators = [
            '?', 'ไหม', 'หรือ', 'อะไร', 'ยังไง', 'เมื่อไหร่', 'ที่ไหน', 
            'ทำไม', 'อย่างไร', 'ครับ', 'ค่ะ', 'มั้ย', 'กี่', 'ขนาดไหน'
        ]
        has_question = any(indicator in text for indicator in question_indicators)
        
        if not has_question:
            print(f"❌ No question indicators found")
            return False
        
        # ตรวจสอบว่าไม่ใช่การทำซ้ำ
        if text.count('ครับ') > 2 or text.count('ค่ะ') > 2:
            print(f"❌ Too repetitive")
            return False
        
        print(f"✅ Valid question: {text[:50]}...")
        return True

    def _generate_structured_summary(self, history: List[Dict[str, str]]) -> str:
        """ใช้เป็น fallback เมื่อ LLM ไม่สามารถสร้างสรุปได้"""
        user_responses = [msg['content'] for msg in history if msg['role'] == 'user']
        doctor_questions = [msg['content'] for msg in history if msg['role'] == 'assistant']
        
        if not user_responses:
            return "ไม่มีข้อมูลเพียงพอสำหรับการสรุป"
            
        chief_complaint = user_responses[0] if user_responses else "ไม่ระบุ"
        summary = f"""📋 **สรุปประวัติผู้ป่วย (Medical Summary)**

🎯 **Chief Complaint (อาการหลัก):**
{chief_complaint}

📝 **History of Present Illness (ประวัติอาการปัจจุบัน):**
"""
        for i, response in enumerate(user_responses, 1):
            summary += f"{i}. {response}\n"
            
        summary += f"""
🔍 **Clinical Assessment (การประเมินเบื้องต้น):**
- จำนวนคำถามที่ซัก: {len(doctor_questions)} คำถาม
- ข้อมูลที่ได้รับ: {len(user_responses)} รายการ
- ความสมบูรณ์ของข้อมูล: {'เพียงพอสำหรับการประเมินเบื้องต้น' if len(user_responses) >= 4 else 'ต้องการข้อมูลเพิ่มเติม'}

💊 **Recommendation (ข้อเสนอแนะ):**
1. ตรวจร่างกาย (Physical Examination)
2. พิจารณาการตรวจทางห้องปฏิบัติการตามความเหมาะสม
3. ติดตามอาการและประเมินการตอบสนองต่อการรักษา
4. ให้คำแนะนำการดูแลตนเองเบื้องต้น

⚠️ **หมายเหตุ:**
ข้อมูลนี้เป็นการรวบรวมจากการซักประวัติเบื้องต้น ต้องประกอบการตรวจร่างกายและการตรวจอื่นๆ เพื่อการวินิจฉัยที่แม่นยำ"""
        
        print("🔄 Using structured summary (fallback)")
        return summary