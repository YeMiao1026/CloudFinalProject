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

# Create a virtual environment and install Python dependencies as root so packages
# are properly installed into the venv. We will drop privileges later.
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --upgrade pip
RUN if [ -f /app/requirements.txt ]; then pip install --no-cache-dir -r /app/requirements.txt; fi

# Create a non-root user and ensure ownership of app and venv directories
RUN groupadd -r app && useradd -r -g app -d /app -s /sbin/nologin app || true
RUN chown -R app:app /app /opt/venv

# Switch to non-root user for runtime
USER app
ENV VENV_PATH=/opt/venv
ENV PATH="$VENV_PATH/bin:$PATH"

# Ensure runtime works as non-root
WORKDIR /app

EXPOSE 8000

# Allow platform to set PORT (e.g., Render sets $PORT). Default to 8000 when not provided.
ENV PORT=8000

# Run uvicorn, reading PORT from environment (runs as non-root user)
CMD ["sh", "-c", "$VENV_PATH/bin/python -m uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
