/**
 * US-021: Notification Parser Registry
 *
 * Mantiene la lista de parsers disponibles y resuelve el parser más adecuado
 * según el proveedor y el contenido del evento crudo.
 */

import type { INotificationParser } from './INotificationParser';
import type { RawEvent } from '../../models/RawEvent';
import { BBVANotificationParser } from './BBVANotificationParser';
import { GenericNotificationParser } from './GenericNotificationParser';

export class NotificationParserRegistry {
  private static instance: NotificationParserRegistry;
  private parsers: INotificationParser[] = [];
  private fallbackParser: INotificationParser;

  private constructor() {
    this.fallbackParser = new GenericNotificationParser();
    // Registrar parsers especializados en orden de prioridad
    this.register(new BBVANotificationParser());
  }

  public static getInstance(): NotificationParserRegistry {
    if (!NotificationParserRegistry.instance) {
      NotificationParserRegistry.instance = new NotificationParserRegistry();
    }
    return NotificationParserRegistry.instance;
  }

  public register(parser: INotificationParser): void {
    this.parsers.unshift(parser);
  }

  public resolve(provider: string, rawEvent: RawEvent): INotificationParser {
    for (const parser of this.parsers) {
      if (parser.canParse(provider, rawEvent)) {
        return parser;
      }
    }
    return this.fallbackParser;
  }
}
