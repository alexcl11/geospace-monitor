import { Component, OnInit, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common'; // <-- VITAL para poder usar el *ngFor en los botones
import { HttpClient } from '@angular/common/http';
import { finalize, timeout } from 'rxjs';
import * as L from 'leaflet';
import { environment } from '../environments/environment';
import { HttpHeaders } from '@angular/common/http';

import 'leaflet.heat';

// Añadimos esta interfaz para que TS no se queje de L.heatLayer
declare module 'leaflet' {
  function heatLayer(latlngs: L.LatLngExpression[], options?: any): L.Layer;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule], // <-- Lo añadimos aquí
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class AppComponent implements OnInit, AfterViewInit {
  private map: any;
  private markerLayerGroup = L.layerGroup(); // Grupo para poder borrar y repintar puntos
  private heatLayer: any = null;
  private apiUrl = environment.apiUrl;
  private loadingFailSafeTimer: ReturnType<typeof setTimeout> | null = null;
  private mobileBreakpoint = 900;


  isLoading: boolean = true;
  isSidebarOpen: boolean = false;

  // Variables para la interfaz
  allEvents: any[] = [];
  filteredEvents: any[] = [];
  categories: string[] = ['All'];
  selectedCategory: string = 'All';
  showMarkers: boolean = true;
  showHeatmap: boolean = true;
  heatRadius: number = 25;
  heatBlur: number = 15;
  categoryStats: Array<{ name: string; count: number }> = [];
  timeRangeText: string = 'No data';
  lastSyncText: string = '--';

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {}

  ngAfterViewInit() {
    this.initMap();
    this.fetchNASAEvents();
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
    this.refreshMapSize();
  }

  closeSidebar(): void {
    this.isSidebarOpen = false;
    this.refreshMapSize();
  }

  isMobileView(): boolean {
    return window.innerWidth <= this.mobileBreakpoint;
  }

  private initMap(): void {
    // 1. Configuración física del mapa
    this.map = L.map('map', { 
      zoomControl: false,
      minZoom: 2, // Evita que el usuario aleje tanto que la Tierra se vuelva un punto
      maxZoom: 18,
      maxBounds: [[-90, -180], [90, 180]], // Límites físicos del planeta
      maxBoundsViscosity: 1.0, // Hace que los bordes sean sólidos (no rebotan)
      worldCopyJump: false // Desactiva el salto al cruzar el Océano Pacífico
    });
    
    L.control.zoom({ position: 'topright' }).addTo(this.map);

    // 2. Configuración gráfica (AQUÍ ESTÁ EL TRUCO: noWrap y bounds)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap contributors, © CARTO',
      noWrap: true, // <--- ESTO EVITA QUE EL MAPA SE REPITA A LOS LADOS
      bounds: [[-90, -180], [90, 180]] // <--- Evita que intente cargar imágenes fuera de los polos
    }).addTo(this.map);

    this.markerLayerGroup.addTo(this.map);

    // 3. Ajuste automático a la pantalla
    // En lugar de un setView fijo, le decimos que encuadre todo el planeta
    this.map.fitBounds([
      [-60, -180], // Esquina inferior izquierda (Cortamos un poco la Antártida para centrar mejor)
      [80, 180]    // Esquina superior derecha
    ]);
  }

  private fetchNASAEvents(): void {
    this.isLoading = true; // Encendemos el loading por si acaso
    this.startLoadingFailSafe();

    const headers = new HttpHeaders({
      'ngrok-skip-browser-warning': 'true'
    });

    this.http.get<any>(this.apiUrl, { headers: headers }).pipe(
      timeout(50000),
      finalize(() => {
        // Pase lo que pase (éxito, error o timeout), apagamos el loading.
        this.isLoading = false;
        this.clearLoadingFailSafe();
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (data) => {
        this.allEvents = Array.isArray(data?.events) ? data.events : [];
        this.filteredEvents = this.allEvents;

        // Magia de JS: Extraemos las categorías únicas de los datos de la NASA
        const cats = new Set(this.allEvents.map(e => e.category));
        this.categories = ['All', ...Array.from(cats)];

        this.lastSyncText = new Date().toLocaleString();
        this.updateDerivedStats();
        this.drawMarkers();
      },
      error: (err) => {
        console.error('Error de conexión:', err,);
      }
    });
  }

  private startLoadingFailSafe(): void {
    this.clearLoadingFailSafe();

    // Evita que el overlay quede infinito por cualquier estado no esperado.
    this.loadingFailSafeTimer = setTimeout(() => {
      this.isLoading = false;
      this.cdr.detectChanges();
    }, 12000);
  }

  private clearLoadingFailSafe(): void {
    if (this.loadingFailSafeTimer) {
      clearTimeout(this.loadingFailSafeTimer);
      this.loadingFailSafeTimer = null;
    }
  }

  // Función que se ejecuta al hacer clic en un botón del menú
  filterByCategory(category: string): void {
    this.selectedCategory = category;
    if (category === 'All') {
      this.filteredEvents = this.allEvents;
    } else {
      this.filteredEvents = this.allEvents.filter(e => e.category === category);
    }
    this.updateDerivedStats();
    this.drawMarkers(); // Repintamos el mapa con los filtrados

    if (this.isMobileView()) {
      this.closeSidebar();
    }
  }

  private refreshMapSize(): void {
    if (!this.map) return;

    setTimeout(() => {
      this.map.invalidateSize();
    }, 320);
  }

  private drawMarkers(): void {
    this.markerLayerGroup.clearLayers(); // Borramos los puntos antiguos

    if (this.heatLayer) {
      this.map.removeLayer(this.heatLayer);
      this.heatLayer = null;
    }

    const heatPoints: any[] = [];

    this.filteredEvents.forEach((event: any) => {
      try {
        // 1. Blindaje: Nos aseguramos de que la categoría existe como texto
        const cat = event.category ? String(event.category) : 'Unknown';
        
        if (event.coordinates && event.coordinates.lat != null && event.coordinates.lon != null) {
          const lat = Number(event.coordinates.lat);
          const lon = Number(event.coordinates.lon);

          if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return;
          }

        // 2. Asignamos colores
        let markerColor = "#ff3300"; // Rojo (Incendios)
        if (cat.includes('Volcanoes')) markerColor = "#ffaa00"; 
        else if (cat.includes('Icebergs')) markerColor = "#00d2ff"; 
        else if (cat.includes('Storms')) markerColor = "#cc00ff"; 

          if (this.showMarkers) {
            // Calcular radio dinámico basado en magnitud
            const radius = this.calculateMarkerRadius(event);
            
            const marker = L.circleMarker([lat, lon], {
              radius: radius,
              fillColor: markerColor,
              color: markerColor,
              weight: 1,
              opacity: 1,
              fillOpacity: 0.8
            });

        // // 3. Blindaje: Comprobamos que las coordenadas existen antes de dibujar
        // if (event.coordinates && event.coordinates.lat && event.coordinates.lon) {
        //   const marker = L.circleMarker([event.coordinates.lat, event.coordinates.lon], {
        //     radius: 6,
        //     fillColor: markerColor,
        //     color: markerColor,
        //     weight: 1,
        //     opacity: 1,
        //     fillOpacity: 0.8
        //   });
          
            marker.bindPopup(`
              <strong style="color: ${markerColor};">${event.title}</strong><br>
              Categoría: ${cat}<br>
              Fecha: ${new Date(event.date).toLocaleDateString()}<br>
              Magnitud: ${this.getMagnitudeDisplay(event)}
            `);
            
            this.markerLayerGroup.addLayer(marker);
          }

          // Usar magnitud para intensidad del heatmap
          const heatIntensity = this.getHeatIntensity(event);
          heatPoints.push([lat, lon, heatIntensity]);
        }
      } catch (error) {
        // Si un evento de la NASA viene rarísimo, lo ignoramos para que no rompa la web
        console.warn('Evento saltado por datos corruptos:', event.title);
      }
    });

    if (this.showHeatmap && heatPoints.length > 0) {
      this.heatLayer = L.heatLayer(heatPoints, {
        radius: this.heatRadius,
        blur: this.heatBlur,
        maxZoom: 10,
        gradient: {
          0.0: '#ffcc99', // Amarillo anaranjado - magnitud muy baja
          0.2: '#ffb347', // Naranja suave - magnitud baja
          0.4: '#ff8c00', // Naranja intenso - magnitud media
          0.6: '#ff6347', // Rojo anaranjado - magnitud media-alta
          0.8: '#ff3300', // Rojo brillante - magnitud alta
          1.0: '#cc0000'  // Rojo oscuro - magnitud máxima
        }
      }).addTo(this.map);
    }

  }

  toggleMarkers(): void {
    this.showMarkers = !this.showMarkers;
    this.drawMarkers();
  }

  toggleHeatmap(): void {
    this.showHeatmap = !this.showHeatmap;
    this.drawMarkers();
  }

  setHeatRadius(value: number | string): void {
    const nextRadius = Number(value);
    if (!Number.isFinite(nextRadius)) {
      return;
    }

    this.heatRadius = Math.min(50, Math.max(10, nextRadius));
    if (this.showHeatmap) {
      this.drawMarkers();
    }
  }

  getCategoryColor(category: string): string {
    const cat = category || 'Unknown';
    if (cat.includes('Volcanoes')) return '#ffaa00';
    if (cat.includes('Icebergs')) return '#00d2ff';
    if (cat.includes('Storms')) return '#cc00ff';
    return '#ff3300';
  }

  private updateDerivedStats(): void {
    const categoryCounter = new Map<string, number>();
    const validDates: Date[] = [];

    this.filteredEvents.forEach((event: any) => {
      const category = event?.category ? String(event.category) : 'Unknown';
      categoryCounter.set(category, (categoryCounter.get(category) || 0) + 1);

      const dateValue = event?.date ? new Date(event.date) : null;
      if (dateValue && !Number.isNaN(dateValue.getTime())) {
        validDates.push(dateValue);
      }
    });

    this.categoryStats = Array.from(categoryCounter.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    if (validDates.length === 0) {
      this.timeRangeText = 'No data';
      return;
    }

    const sortedDates = validDates.sort((a, b) => a.getTime() - b.getTime());
    const firstDate = sortedDates[0];
    const lastDate = sortedDates[sortedDates.length - 1];

    this.timeRangeText = `${firstDate.toLocaleDateString()} - ${lastDate.toLocaleDateString()}`;
  }

  private getMagnitudeDisplay(event: any): string {
    const magnitude = event?.magnitudeValue;
    const unit = event?.magnitudeUnit;

    if (magnitude == null) {
      return 'N/A';
    }

    // Conversión de acres a km²
    if (unit === 'acres') {
      const km2 = magnitude * 0.00404686;
      return `${magnitude} acres (${km2.toFixed(2)} km²)`;
    }

    // Otros units se muestran como están
    if (unit) {
      return `${magnitude} ${unit}`;
    }

    return String(magnitude);
  }

  private calculateMarkerRadius(event: any): number {
    const magnitude = event?.magnitudeValue;
    const unit = event?.magnitudeUnit;

    if (magnitude == null || magnitude <= 0) {
      return 6; // Radio por defecto si no hay magnitud
    }

    let areaKm2 = 0;

    // Convertir a km² según el unit
    if (unit === 'acres') {
      areaKm2 = magnitude * 0.00404686;
    } else if (unit === 'km²' || unit === 'square kilometers') {
      areaKm2 = magnitude;
    } else if (unit === 'hectares') {
      areaKm2 = magnitude * 0.01;
    } else {
      // Para units desconocidos, asumir un valor por defecto
      return 6;
    }

    // Convertir área a radio: Area = π * r² => r = sqrt(Area / π)
    const radiusKm = Math.sqrt(areaKm2 / Math.PI);

    // Escalar a píxeles Leaflet (aproximadamente 1 píxel = 0.5 km en zoom 4)
    // Ajustamos la escala para que sea visible pero no demasiado grande
    const radiusPixels = Math.min(Math.max(radiusKm * 2, 6), 40); // Min 6px, Max 40px

    return radiusPixels;
  }

  private getHeatIntensity(event: any): number {
    const magnitude = event?.magnitudeValue;
    const unit = event?.magnitudeUnit;

    if (magnitude == null || magnitude <= 0) {
      return 0.3; // Intensidad mínima por defecto
    }

    let areaKm2 = 0;

    // Convertir a km² según el unit
    if (unit === 'acres') {
      areaKm2 = magnitude * 0.00404686;
    } else if (unit === 'km²' || unit === 'square kilometers') {
      areaKm2 = magnitude;
    } else if (unit === 'hectares') {
      areaKm2 = magnitude * 0.01;
    } else {
      // Para units desconocidos, devolver intensidad media
      return 0.5;
    }

    // Normalizar a rango 0-1 usando escala logarítmica para mejor distribución
    // Log scale: ln(area + 1) para evitar log(0)
    // Máximo esperado: ~10000 km² (eventos grandes)
    const maxKm2 = 10000;
    const logIntensity = Math.log(areaKm2 + 1) / Math.log(maxKm2 + 1);
    
    // Clamped entre 0.2 y 1.0
    return Math.min(Math.max(logIntensity, 0.2), 1.0);
  }
}