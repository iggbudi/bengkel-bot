/**
 * Workshop Tools — pi SDK ToolDefinition format
 * Wraps handleWorkshopTool for use with createAgentSession({ customTools }).
 */

import { Type } from '@sinclair/typebox'
import type { ToolDefinition } from '@earendil-works/pi-coding-agent'
import { handleWorkshopTool } from './workshop.js'

function textResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data) }],
    details: data,
  }
}

async function runTool(name: string, args: Record<string, unknown>) {
  return textResult(await handleWorkshopTool({ name, args }))
}

export function createWorkshopPiTools(): ToolDefinition[] {
  return [
    {
      name: 'lookup_booking',
      label: 'Lookup Booking',
      description:
        'Look up an existing booking by vehicle plate number. ' +
        'Use when a customer asks about service status or booking progress.',
      parameters: Type.Object({
        plate_number: Type.String({ description: 'Vehicle plate number, e.g. "B 1234 CD"' }),
      }),
      execute: async (_id: string, params: Record<string, unknown>) => runTool('lookup_booking', params),
    },
    {
      name: 'create_booking',
      label: 'Create Booking',
      description:
        'Create a new service booking after collecting car model, plate number, service type, and preferred date.',
      parameters: Type.Object({
        customer_id: Type.Optional(Type.String()),
        service_type: Type.String(),
        description: Type.Optional(Type.String()),
        plate_number: Type.String(),
        car_model: Type.Optional(Type.String()),
        preferred_date: Type.Optional(Type.String()),
      }),
      execute: async (_id: string, params: Record<string, unknown>) => runTool('create_booking', params),
    },
    {
      name: 'upsert_customer',
      label: 'Upsert Customer',
      description: 'Register or update a customer record. Call before create_booking.',
      parameters: Type.Object({
        name: Type.Optional(Type.String()),
        phone: Type.String(),
        car_model: Type.Optional(Type.String()),
        plate_number: Type.Optional(Type.String()),
      }),
      execute: async (_id: string, params: Record<string, unknown>) => runTool('upsert_customer', params),
    },
    {
      name: 'update_booking_status',
      label: 'Update Booking Status',
      description: 'Update booking status: pending → approved → in_progress → done',
      parameters: Type.Object({
        booking_id: Type.String(),
        status: Type.Union([
          Type.Literal('pending'),
          Type.Literal('approved'),
          Type.Literal('in_progress'),
          Type.Literal('done'),
          Type.Literal('cancelled'),
        ]),
        notes: Type.Optional(Type.String()),
      }),
      execute: async (_id: string, params: Record<string, unknown>) => runTool('update_booking_status', params),
    },
    {
      name: 'get_service_catalog',
      label: 'Service Catalog',
      description: 'Get workshop service catalog with estimated price ranges.',
      parameters: Type.Object({}),
      execute: async () => runTool('get_service_catalog', {}),
    },
    {
      name: 'escalate_to_montir',
      label: 'Escalate to Montir',
      description: 'Forward conversation to montir team when issue is complex or customer is frustrated.',
      parameters: Type.Object({
        customer_name: Type.Optional(Type.String()),
        plate_number: Type.Optional(Type.String()),
        summary: Type.String(),
        channel: Type.Optional(Type.String()),
      }),
      execute: async (_id: string, params: Record<string, unknown>) => runTool('escalate_to_montir', params),
    },
    {
      name: 'send_whatsapp_message',
      label: 'Send WhatsApp',
      description: 'Send a WhatsApp text message for confirmations and notifications.',
      parameters: Type.Object({
        phone_number: Type.String(),
        message: Type.String(),
      }),
      execute: async (_id: string, params: Record<string, unknown>) => runTool('send_whatsapp_message', params),
    },
  ] as unknown as ToolDefinition[]
}