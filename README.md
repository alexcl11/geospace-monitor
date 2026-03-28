# 🌍 GeoSpace Monitor - Live Telemetry System

<img width="1893" height="841" alt="GeoSpace Monitor Preview" src="https://github.com/user-attachments/assets/b77768e7-82de-4448-a784-2fc3c8054bf1" />


**GeoSpace Monitor** es una plataforma Full-Stack de telemetría en tiempo real que visualiza eventos naturales extremos a lo largo del planeta. Utilizando datos satelitales directamente de la API EONET de la NASA, el sistema procesa, clasifica y renderiza eventos como incendios forestales, tormentas severas y volcanes en un mapa interactivo con soporte para mapas de calor masivos.

🔗 **[Live Demo en Vercel](https://geospace-monitor.vercel.app/)**

---

## 🚀 Características Principales

- **Sincronización en Tiempo Real:** Consumo y normalización de datos de la API de la NASA.
- **Visualización Avanzada:** Renderizado de puntos exactos y mapas de calor (Heatmaps) basados en la magnitud real del evento (ej. acres quemados en un incendio).
- **Filtros Dinámicos:** Capacidad de aislar eventos por categoría (Wildfires, Volcanoes, Storms) y ventana de tiempo.
- **Dark UI / UX:** Diseño enfocado en centros de control e inteligencia geoespacial.

## 🛠️ Stack Tecnológico y Arquitectura

Este proyecto está dividido en dos servicios principales y un pipeline de CI/CD completamente automatizado.



### Frontend (Client-Side)
- **Framework:** Angular 
- **Mapas:** Leaflet + Leaflet.heat (Lazy loaded para optimización de bundle)
- **Despliegue:** Vercel (Optimizando Serverless & Edge network)

### Backend (API & Data Processing)
- **Lenguaje:** Python
- **Infraestructura:** Dockerizado y servido mediante Nginx
- **Despliegue:** VPS en Hetzner Cloud (Alemania)

### DevOps & CI/CD
- **Automatización:** GitHub Actions
- **Pipeline:** Un push a la rama `main` activa un workflow que se conecta por SSH al servidor de Hetzner, hace un pull del código, reconstruye la imagen de Docker y reinicia el contenedor sin tiempo de inactividad (Zero Downtime Deployment).

---

## ⚙️ Instalación y Despliegue Local

Si quieres correr este proyecto en tu propia máquina, sigue estos pasos:

### 1. Clonar el repositorio
```bash
git clone [https://github.com/alexcl11/geospace-monitor.git](https://github.com/alexcl11/geospace-monitor.git)
cd geospace-monitor
````
### 2. Levantar el Backend (Python / Docker)
Asegúrate de tener Docker instalado en tu sistema.

````bash
cd backend
docker build -t geospace-api .
docker run -p 8000:8000 geospace-api
````
La API estará disponible en http://localhost:8000/api/events
### 3. Levantar el Frontend (Angular)
Asegúrate de tener Node.js (v22.x recomendado) y Angular CLI instalados.

````bash
cd frontend
npm install
npm start
````
La aplicación estará disponible en http://localhost:4200

--- 

## 📊 Nota sobre la fuente de datos (NASA EONET)

Actualmente, este proyecto consume la **API EONET de la NASA**. Es importante destacar que EONET provee datos de eventos "curados", es decir, eventos que ya han sido identificados, nombrados y clasificados por agencias gubernamentales (como InciWeb en EE.UU.). Esto genera un sesgo visual natural hacia Norteamérica y Australia en los mapas de calor.

*🚀 Siguiente paso en el Roadmap: Integración con la API **NASA FIRMS** (sensores satelitales MODIS/VIIRS crudos) para una detección térmica global 100% automatizada sin sesgo geográfico.*

---

**Desarrollado con ☕ y 💻 por Alejandro** <br>

[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/alejandro-canovas)
[![Gmail](https://img.shields.io/badge/Gmail-D14836?style=for-the-badge&logo=gmail&logoColor=white)](mailto:alejandro.canovaslopez1@gmail.com)
