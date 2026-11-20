FROM python:3.12-slim

# Prevent Python from writing .pyc and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860

WORKDIR /app

# Install curl for healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face Spaces runs with user ID 1000
RUN useradd -m -u 1000 appuser

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

# Set ownership to appuser
RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 7860

# Run FastAPI with Uvicorn on Hugging Face port 7860
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]

