/**
 * Native Google Calendar Tools for Tesseract.
 *
 * Direct REST integration with Google Calendar API v3.
 * Deterministic, instant schedule lookups and updates without DOM overhead.
 */
import { GoogleConnector } from './google-connector.js';
export interface CalendarEvent {
    id: string;
    summary: string;
    description?: string;
    start: string;
    end: string;
    location?: string;
    attendees?: string[];
    htmlLink?: string;
}
export declare class CalendarTools {
    static register(connector: GoogleConnector): void;
    static getTodayEvents(connector: GoogleConnector): Promise<CalendarEvent[]>;
    static getUpcomingEvents(connector: GoogleConnector, days?: number): Promise<CalendarEvent[]>;
    static searchEvents(connector: GoogleConnector, query: string): Promise<CalendarEvent[]>;
    static createEvent(connector: GoogleConnector, params: {
        summary: string;
        start: string;
        end: string;
        description?: string;
        location?: string;
        confirmed?: boolean;
    }): Promise<CalendarEvent>;
    static updateEvent(connector: GoogleConnector, params: {
        eventId: string;
        summary?: string;
        start?: string;
        end?: string;
        description?: string;
    }): Promise<CalendarEvent>;
    static deleteEvent(connector: GoogleConnector, params: {
        eventId: string;
        confirmed?: boolean;
    }): Promise<{
        success: boolean;
        eventId: string;
    }>;
    private static fetchEvents;
    private static formatEvent;
}
//# sourceMappingURL=calendar-tools.d.ts.map