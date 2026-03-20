FROM python:3.12-slim

RUN pip install --no-cache-dir cadquery

WORKDIR /app
COPY swatch-service/server.py ./
COPY backend/src/services/swatch_generator.py ./
COPY swatch.step ./
COPY backend/src/services/Arial.ttf ./

EXPOSE 7321
CMD ["python", "server.py"]
