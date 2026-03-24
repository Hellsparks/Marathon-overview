FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir cadquery

WORKDIR /app
COPY swatch-service/server.py ./
COPY backend/src/services/swatch_generator.py ./
COPY swatch.step ./
COPY backend/src/services/Arial.ttf ./

EXPOSE 7321
CMD ["python", "server.py"]
