/**
 * Workshop Tools — injected into the pi SDK AgentSession
 * Each tool maps to a concrete function the LLM can call.
 */

import { z } from 'zod'
import { CustomerRepo, BookingRepo, ConversationRepo } from '../db/schema.js'

const WORKSHOP_ID = 'default'

type ToolChannel = 'whatsapp' | 'telegram' | 'web'

export interface WorkshopToolContext {
  chatId?: string
  channel?: ToolChannel
}

let _toolContext: WorkshopToolContext | null = null

export function setWorkshopToolContext(ctx: WorkshopToolContext): void {
  _toolContext = ctx
}

export function clearWorkshopToolContext(): void {
  _toolContext = null
}

export function getWorkshopToolContext(): WorkshopToolContext | null {
  return _toolContext
}

// ── Tool definitions (OpenAI tool-call format) ────────────────────────────

export const workshopToolDefs = [
  {
    name: 'lookup_booking',
    description:
      'Look up an existing booking by vehicle plate number. ' +
      'Use this when a customer asks about their service status or booking progress.',
    parameters: {
      type: 'object',
      properties: {
        plate_number: {
          type: 'string',
          description: 'Vehicle plate number, e.g. "B 1234 CD" or "KT 5678 E"',
        },
      },
      required: ['plate_number'],
    },
  },
  {
    name: 'create_booking',
    description:
      'Create a new service booking after collecting: car model, plate number, ' +
      'service type, and preferred date/time. Always confirm details with the customer before creating.',
    parameters: {
      type: 'object',
      properties: {
        customer_id: { type: 'string', description: 'Customer ID (from upsert_customer)' },
        service_type: { type: 'string', description: 'Type of service requested' },
        description: { type: 'string', description: "Customer's complaint or description" },
        plate_number: { type: 'string', description: 'Vehicle plate number' },
        car_model: { type: 'string', description: 'Car make and model' },
        preferred_date: { type: 'string', description: 'Preferred date/time, e.g. "2026-06-13 09:00"' },
      },
      required: ['service_type', 'plate_number'],
    },
  },
  {
    name: 'upsert_customer',
    description:
      'Register or update a customer record with their name, phone, car model, and plate number. ' +
      'Call this before creating a booking to link the booking to a known customer.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: "Customer's name" },
        phone: { type: 'string', description: "Customer's WhatsApp/Telegram phone number" },
        car_model: { type: 'string', description: 'Car make and model' },
        plate_number: { type: 'string', description: 'Vehicle plate number' },
      },
      required: ['phone'],
    },
  },
  {
    name: 'update_booking_status',
    description:
      'Update the status of an existing booking. ' +
      'Montir uses this to move a booking through: pending → approved → in_progress → done',
    parameters: {
      type: 'object',
      properties: {
        booking_id: { type: 'string', description: 'Booking ID (returned from create_booking)' },
        status: {
          type: 'string',
          enum: ['pending', 'approved', 'in_progress', 'done', 'cancelled'],
          description: 'New booking status',
        },
        notes: { type: 'string', description: 'Optional notes, e.g. final price or diagnosis' },
      },
      required: ['booking_id', 'status'],
    },
  },
  {
    name: 'get_service_catalog',
    description:
      'Get the workshop service catalog with descriptions and estimated price ranges. ' +
      'Use this when customer asks about available services or pricing.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'escalate_to_montir',
    description:
      'Forward the current conversation to the workshop montir team with a summary. ' +
      'Use this when the issue is too complex, the customer is frustrated, ' +
      'or the bot cannot answer confidently after 2 attempts.',
    parameters: {
      type: 'object',
      properties: {
        customer_name: { type: 'string', description: "Customer's name" },
        plate_number: { type: 'string', description: 'Vehicle plate number if known' },
        summary: { type: 'string', description: 'Brief summary of the issue and conversation so far' },
        channel: { type: 'string', description: 'Chat channel: whatsapp or telegram' },
      },
      required: ['summary'],
    },
  },
  {
    name: 'send_whatsapp_message',
    description: 'Send a WhatsApp text message to a specific phone number. Use for confirmations and notifications.',
    parameters: {
      type: 'object',
      properties: {
        phone_number: { type: 'string', description: 'Full phone number with country code, e.g. 6281234567890' },
        message: { type: 'string', description: 'Message text to send' },
      },
      required: ['phone_number', 'message'],
    },
  },
]

// ── Tool handlers ──────────────────────────────────────────────────────────

type ToolCall = { name: string; args: Record<string, unknown> }

export async function handleWorkshopTool(call: ToolCall): Promise<string> {
  const { name, args } = call

  switch (name) {
    case 'lookup_booking': {
      const { plate_number } = args as { plate_number: string }
      const booking = BookingRepo.findByPlate(plate_number?.toUpperCase())
      if (!booking) {
        return JSON.stringify({ found: false, message: `Tidak ada booking ditemukan untuk plat ${plate_number}` })
      }
      return JSON.stringify({ found: true, booking })
    }

    case 'upsert_customer': {
      const { name, phone, car_model, plate_number } = args as {
        name?: string; phone: string; car_model?: string; plate_number?: string
      }
      // Normalize phone — strip non-digits, add 62 if starts with 0
      const digitsOnly = phone.replace(/\D/g, '')
      const normalizedPhone = digitsOnly.replace(/^0/, '62')
      const customer = CustomerRepo.upsert({
        workshop_id: WORKSHOP_ID,
        name: name ?? null,
        phone: normalizedPhone,
        car_model: car_model ?? null,
        plate_number: plate_number ?? null,
      })

      const ctx = getWorkshopToolContext()
      if (ctx?.chatId && ctx.channel) {
        ConversationRepo.linkCustomer(ctx.chatId, ctx.channel, customer.id)
      }

      return JSON.stringify({ success: true, customer_id: customer.id })
    }

    case 'create_booking': {
      const {
        customer_id, service_type, description, plate_number,
        car_model, preferred_date,
      } = args as Record<string, string | undefined>

      if (!service_type || !plate_number) {
        return JSON.stringify({ success: false, error: 'service_type dan plate_number wajib diisi' })
      }

      const booking = BookingRepo.create({
        workshop_id: WORKSHOP_ID,
        customer_id: customer_id ?? null,
        service_type,
        description: description ?? null,
        plate_number: plate_number.toUpperCase(),
        car_model: car_model ?? null,
        booked_at: preferred_date ?? null,
        id: undefined,
        estimate_low: undefined,
        estimate_high: undefined,
        final_price: undefined,
        status: 'pending',
      } as any)
      return JSON.stringify({ success: true, booking_id: booking.id, message: `Booking berhasil! ID: ${booking.id}` })
    }

    case 'update_booking_status': {
      const { booking_id, status, notes } = args as {
        booking_id: string; status: string; notes?: string
      }
      const validStatuses = ['pending', 'approved', 'in_progress', 'done', 'cancelled']
      if (!validStatuses.includes(status)) {
        return JSON.stringify({ success: false, error: `Status tidak valid. Pilih: ${validStatuses.join(', ')}` })
      }
      BookingRepo.updateStatus(booking_id, status as never, notes)
      return JSON.stringify({ success: true, message: `Booking ${booking_id} diupdate ke "${status}"` })
    }

    case 'get_service_catalog': {
      // Returns embedded catalog — in production this would come from a DB or KB file
      return JSON.stringify({
        services: [
          { name: 'Service Completo', description: 'Ganti oli, cek rem, cek aki, cek busi, cuci ringan', estimate: 'Rp 350.000 - 600.000' },
          { name: 'Ganti Oli', description: 'Ganti oli mesin + filter oli', estimate: 'Rp 150.000 - 300.000' },
          { name: 'Tune Up', description: 'Cek busi, koil, filter, cairan, rem', estimate: 'Rp 250.000 - 500.000' },
          { name: 'Ganti Rem', description: 'Ganti kampas rem depan/belakang', estimate: 'Rp 200.000 - 450.000 per as' },
          { name: 'Ganti Aki', description: 'Ganti aki baru + cek alternator', estimate: 'Rp 350.000 - 900.000' },
          { name: 'Spooring / Balancing', description: 'Spooring + balancing 4 roda', estimate: 'Rp 100.000 - 200.000' },
          { name: 'Flushing Oli Mesin', description: 'Flushing sebelum ganti oli baru', estimate: 'Rp 75.000 - 150.000' },
          { name: 'Diagnosa Kerusakan', description: 'Cek komputer + diagnosis error code', estimate: 'Rp 50.000 - 150.000' },
        ],
      })
    }

    case 'escalate_to_montir': {
      const { customer_name, plate_number, summary, channel } = args as {
        customer_name?: string; plate_number?: string; summary: string; channel?: string
      }
      // In production: forward to montir WhatsApp group
      console.log(`[ESCALATION] ${channel?.toUpperCase()} | ${customer_name ?? 'Unknown'} | Plat: ${plate_number ?? '-'}\n${summary}`)
      return JSON.stringify({
        success: true,
        message: 'Kasus diteruskan ke tim montir. Akan dihubungi dalam 30 menit ya! 🙏',
      })
    }

    case 'send_whatsapp_message': {
      const { phone_number, message } = args as { phone_number: string; message: string }
      // In production: enqueue to Baileys send queue
      console.log(`[WA SEND] → ${phone_number}: ${message}`)
      return JSON.stringify({ success: true, sent_to: phone_number })
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` })
  }
}
