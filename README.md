# 🌍 GeoSpace Monitor - Live Telemetry System

![GeoSpace Monitor Preview](URL_DE_TU_CAPTURA_DEL_MAPA_DE_FUEGO)

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