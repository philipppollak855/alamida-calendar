import React, { useState, useEffect } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import { format, parseISO } from 'date-fns';
import de from 'date-fns/locale/de';
import './CalendarPage.css';

const localizer = dateFnsLocalizer(de);

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  category: EventCategory;
  standort: string;
  location: string;
}

type EventCategory = 'Begraebnis' | 'Aufnahme' | 'Vorsorge' | 'Bereitschaft' | 'Abwesenheit' | 'Sonstiges';

const categoryColors: Record<EventCategory, string> = {
  Begraebnis: '#dc2626',
  Aufnahme: '#16a34a',
  Vorsorge: '#2563eb',
  Bereitschaft: '#d97706',
  Abwesenheit: '#9333ea',
  Sonstiges: '#6b7280'
};

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<EventCategory | 'Alle'>('Alle');
  const [selectedStandort, setSelectedStandort] = useState<string>('Alle');
  const [availableStandorte, setAvailableStandorte] = useState<string[]>([]);

  // Demo-Daten (später durch Google Calendar API ersetzen)
  useEffect(() => {
    const demoEvents: CalendarEvent[] = [
      {
        id: '1',
        title: 'Beisetzung: Max Mustermann',
        start: new Date(),
        end: new Date(Date.now() + 3600000),
        category: 'Begraebnis',
        standort: 'Friedhof Grafenbach',
        location: 'Friedhof Grafenbach'
      },
      {
        id: '2',
        title: 'Trauerfeier: Maria Schmidt',
        start: new Date(Date.now() + 86400000),
        end: new Date(Date.now() + 86400000 + 3600000),
        category: 'Begraebnis',
        standort: 'Kirche St. Peter',
        location: 'Kirche St. Peter'
      },
      {
        id: '3',
        title: 'Aufnahme: Hans Müller',
        start: new Date(Date.now() + 172800000),
        end: new Date(Date.now() + 172800000 + 3600000),
        category: 'Aufnahme',
        standort: 'Bestattungshaus',
        location: 'Bestattungshaus'
      }
    ];
    
    setEvents(demoEvents);
    const standorte = [...new Set(demoEvents.map(e => e.standort))];
    setAvailableStandorte(standorte);
  }, []);

  const filteredEvents = events.filter(event => {
    const categoryMatch = selectedCategory === 'Alle' || event.category === selectedCategory;
    const standortMatch = selectedStandort === 'Alle' || event.standort === selectedStandort;
    return categoryMatch && standortMatch;
  });

  const eventStyleGetter = (event: CalendarEvent) => {
    return {
      style: {
        backgroundColor: categoryColors[event.category],
        borderRadius: '4px',
        border: 'none',
        color: 'white',
        padding: '4px'
      }
    };
  };

  return (
    <div className="calendar-page">
      <div className="calendar-header">
        <h1>Alamida Kalender</h1>
        <div className="filters">
          <div className="filter-group">
            <label>Kategorie:</label>
            <select 
              value={selectedCategory} 
              onChange={(e) => setSelectedCategory(e.target.value as EventCategory | 'Alle')}
            >
              <option value="Alle">Alle</option>
              <option value="Begraebnis">Begräbnis</option>
              <option value="Aufnahme">Aufnahme</option>
              <option value="Vorsorge">Vorsorge</option>
              <option value="Bereitschaft">Bereitschaft</option>
              <option value="Abwesenheit">Abwesenheit</option>
              <option value="Sonstiges">Sonstiges</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Standort:</label>
            <select 
              value={selectedStandort} 
              onChange={(e) => setSelectedStandort(e.target.value)}
            >
              <option value="Alle">Alle</option>
              {availableStandorte.map(standort => (
                <option key={standort} value={standort}>{standort}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      
      <div className="calendar-container">
        <Calendar
          localizer={localizer}
          events={filteredEvents}
          startAccessor="start"
          endAccessor="end"
          style={{ height: 600 }}
          eventPropGetter={eventStyleGetter}
          views={[Views.Month, Views.Week, Views.Day, Views.Agenda]}
          defaultView={Views.Month}
        />
      </div>

      <div className="calendar-legend">
        <h3>Legende</h3>
        <div className="legend-items">
          {Object.entries(categoryColors).map(([category, color]) => (
            <div key={category} className="legend-item">
              <span 
                className="legend-color" 
                style={{ backgroundColor: color }}
              />
              <span>{category}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
