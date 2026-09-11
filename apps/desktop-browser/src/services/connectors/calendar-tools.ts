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

export class CalendarTools {
  public static register(connector: GoogleConnector): void {
    connector.registerToolHandler('calendar.today', async () => CalendarTools.getTodayEvents(connector));
    connector.registerToolHandler('calendar.upcoming', async (params) => CalendarTools.getUpcomingEvents(connector, params?.days || 7));
    connector.registerToolHandler('calendar.search', async (params) => CalendarTools.searchEvents(connector, params?.query));
    connector.registerToolHandler('calendar.createEvent', async (params) => CalendarTools.createEvent(connector, params));
    connector.registerToolHandler('calendar.updateEvent', async (params) => CalendarTools.updateEvent(connector, params));
    connector.registerToolHandler('calendar.deleteEvent', async (params) => CalendarTools.deleteEvent(connector, params));
  }

  public static async getTodayEvents(connector: GoogleConnector): Promise<CalendarEvent[]> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
    return CalendarTools.fetchEvents(connector, startOfDay, endOfDay);
  }

  public static async getUpcomingEvents(connector: GoogleConnector, days: number = 7): Promise<CalendarEvent[]> {
    const now = new Date();
    const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return CalendarTools.fetchEvents(connector, now.toISOString(), future.toISOString());
  }

  public static async searchEvents(connector: GoogleConnector, query: string): Promise<CalendarEvent[]> {
    const token = await connector.getValidAccessToken();
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?q=${encodeURIComponent(query || '')}&maxResults=10&singleEvents=true&orderBy=startTime`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Calendar search failed: ${await res.text()}`);
    const data = await res.json();
    return (data.items || []).map(CalendarTools.formatEvent);
  }

  public static async createEvent(
    connector: GoogleConnector,
    params: { summary: string; start: string; end: string; description?: string; location?: string; confirmed?: boolean }
  ): Promise<CalendarEvent> {
    if (!params.confirmed) {
      throw new Error('CONFIRMATION_REQUIRED: Creating a calendar event requires user confirmation.');
    }

    const token = await connector.getValidAccessToken();
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: params.summary,
        description: params.description,
        location: params.location,
        start: { dateTime: params.start },
        end: { dateTime: params.end },
      }),
    });

    if (!res.ok) throw new Error(`Calendar createEvent failed: ${await res.text()}`);
    const data = await res.json();
    return CalendarTools.formatEvent(data);
  }

  public static async updateEvent(
    connector: GoogleConnector,
    params: { eventId: string; summary?: string; start?: string; end?: string; description?: string }
  ): Promise<CalendarEvent> {
    const token = await connector.getValidAccessToken();
    const patchBody: any = {};
    if (params.summary) patchBody.summary = params.summary;
    if (params.description) patchBody.description = params.description;
    if (params.start) patchBody.start = { dateTime: params.start };
    if (params.end) patchBody.end = { dateTime: params.end };

    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${params.eventId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patchBody),
    });

    if (!res.ok) throw new Error(`Calendar updateEvent failed: ${await res.text()}`);
    const data = await res.json();
    return CalendarTools.formatEvent(data);
  }

  public static async deleteEvent(
    connector: GoogleConnector,
    params: { eventId: string; confirmed?: boolean }
  ): Promise<{ success: boolean; eventId: string }> {
    if (!params.confirmed) {
      throw new Error('CONFIRMATION_REQUIRED: Deleting a calendar event requires explicit user confirmation.');
    }

    const token = await connector.getValidAccessToken();
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${params.eventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`Calendar deleteEvent failed: ${await res.text()}`);
    return { success: true, eventId: params.eventId };
  }

  private static async fetchEvents(connector: GoogleConnector, timeMin: string, timeMax: string): Promise<CalendarEvent[]> {
    const token = await connector.getValidAccessToken();
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Calendar fetch failed: ${await res.text()}`);
    const data = await res.json();
    return (data.items || []).map(CalendarTools.formatEvent);
  }

  private static formatEvent(item: any): CalendarEvent {
    return {
      id: item.id,
      summary: item.summary || '(Untitled)',
      description: item.description,
      start: item.start?.dateTime || item.start?.date || '',
      end: item.end?.dateTime || item.end?.date || '',
      location: item.location,
      attendees: (item.attendees || []).map((a: any) => a.email),
      htmlLink: item.htmlLink,
    };
  }
}
