# Use the official vLLM image with CUDA 12.1 for GPU support
FROM vllm/vllm-openai:v0.8.0

# Set working directory
WORKDIR /app

# Copy requirements.txt from backend folder
COPY backend/requirements.txt .

# Install Python dependencies from requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
RUN pip install vllm transformers accelerate
RUN pip install -U bitsandbytes
# Copy application files
COPY backend/app.py .
COPY backend/models.py .
COPY backend/.env .

# Expose the FastAPI port
EXPOSE 8000

# Set environment variable for Hugging Face token (loaded from .env)
ENV HUGGING_FACE_HUB_TOKEN=$HF_TOKEN

# Override default entrypoint to run Uvicorn directly
ENTRYPOINT []
CMD ["python", "main.py"]
