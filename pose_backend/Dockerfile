FROM python:3.10-slim-bullseye

# Set working directory
WORKDIR /app

# Install system dependencies required by mediapipe / opencv
# include libgl (mesa) so OpenCV can load GUI libs (provides libGL.so.1)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    wget \
    ca-certificates \
    libglib2.0-0 \
    libsm6 \
    libxrender1 \
    libxext6 \
    libgomp1 \
    libgl1-mesa-glx \
    && rm -rf /var/lib/apt/lists/*

# Copy backend code
COPY . /app

# Install pip and python dependencies
RUN python -m pip install --upgrade pip
RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi

EXPOSE 8000

# Run uvicorn
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
