import { Component, OnInit, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common'; // <-- VITAL para poder usar el *ngFor en los botones
import { HttpClient } from '@angular/common/http';
import { finalize, timeout } from 'rxjs';
import * as L from 'leaflet';
import { environment } from '../environments/environment';
import { HttpClient, HttpHeaders } from '@angular/common/http';
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

    this.filteredEvents.forEach((event: any) => {
      try {
        // 1. Blindaje: Nos aseguramos de que la categoría existe como texto
        const cat = event.category ? String(event.category) : 'Unknown';
        
        // 2. Asignamos colores
        let markerColor = "#ff3300"; // Rojo (Incendios)
        if (cat.includes('Volcanoes')) markerColor = "#ffaa00"; 
        else if (cat.includes('Icebergs')) markerColor = "#00d2ff"; 
        else if (cat.includes('Storms')) markerColor = "#cc00ff"; 

        // 3. Blindaje: Comprobamos que las coordenadas existen antes de dibujar
        if (event.coordinates && event.coordinates.lat && event.coordinates.lon) {
          const marker = L.circleMarker([event.coordinates.lat, event.coordinates.lon], {
            radius: 6,
            fillColor: markerColor,
            color: markerColor,
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
          });
          
          marker.bindPopup(`
            <strong style="color: ${markerColor};">${event.title}</strong><br>
            Categoría: ${cat}<br>
            Fecha: ${new Date(event.date).toLocaleDateString()}
          `);
          
          this.markerLayerGroup.addLayer(marker);
        }
      } catch (error) {
        // Si un evento de la NASA viene rarísimo, lo ignoramos para que no rompa la web
        console.warn('Evento saltado por datos corruptos:', event.title);
      }
    });
  }
}