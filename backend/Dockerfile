# Usamos una imagen oficial de Python súper ligera
FROM python:3.11-slim

# Directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiamos primero las dependencias (optimiza la caché de Docker)
COPY requirements.txt .

# Instalamos las librerías
RUN pip install --no-cache-dir -r requirements.txt

# Copiamos el resto del código
COPY main.py .

# Exponemos el puerto 8000
EXPOSE 8000

# Comando para arrancar el servidor en producción
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]