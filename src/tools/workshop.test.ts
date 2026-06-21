import { describe, expect, it } from 'vitest'
import {
  handleWorkshopTool,
  setWorkshopToolContext,
  clearWorkshopToolContext,
} from './workshop.js'
import { BookingRepo, CustomerRepo, ConversationRepo } from '../db/schema.js'
import { useIsolatedTestDb } from '../test/db-helper.js'

describe('workshop tools', () => {
  useIsolatedTestDb()

  it('lookup_booking returns found booking by plate', async () => {
    BookingRepo.create({
      workshop_id: 'default',
      customer_id: null,
      service_type: 'Ganti Oli',
      description: null,
      plate_number: 'B 1234 CD',
      car_model: 'Honda',
      estimate_low: null,
      estimate_high: null,
      final_price: null,
      booked_at: null,
      status: 'pending',
    })

    const raw = await handleWorkshopTool({
      name: 'lookup_booking',
      args: { plate_number: 'b 1234 cd' },
    })
    const result = JSON.parse(raw)
    expect(result.found).toBe(true)
    expect(result.booking.plate_number).toBe('B 1234 CD')
  })

  it('lookup_booking returns not found for unknown plate', async () => {
    const raw = await handleWorkshopTool({
      name: 'lookup_booking',
      args: { plate_number: 'Z 9999 ZZ' },
    })
    const result = JSON.parse(raw)
    expect(result.found).toBe(false)
  })

  it('upsert_customer normalizes phone and links conversation', async () => {
    ConversationRepo.upsert({
      id: 'conv-1',
      workshop_id: 'default',
      customer_id: null,
      channel: 'web',
      chat_id: 'web:chat-test-12345678',
      messages: [],
      escalated: false,
      last_message_at: null,
    })

    setWorkshopToolContext({ chatId: 'web:chat-test-12345678', channel: 'web' })
    const raw = await handleWorkshopTool({
      name: 'upsert_customer',
      args: {
        name: 'Budi',
        phone: '081234567890',
        car_model: 'Avanza',
        plate_number: 'H 1111 AA',
      },
    })
    clearWorkshopToolContext()

    const result = JSON.parse(raw)
    expect(result.success).toBe(true)
    expect(CustomerRepo.findByPhone('6281234567890')?.name).toBe('Budi')
    expect(
      ConversationRepo.getCustomerId('web:chat-test-12345678', 'web'),
    ).toBe(result.customer_id)
  })

  it('create_booking creates pending booking', async () => {
    const raw = await handleWorkshopTool({
      name: 'create_booking',
      args: {
        service_type: 'Tune Up',
        plate_number: 'K 2222 BB',
        car_model: 'Ertiga',
        description: 'Mesin kasar',
      },
    })
    const result = JSON.parse(raw)
    expect(result.success).toBe(true)
    expect(BookingRepo.findByPlate('K 2222 BB')?.status).toBe('pending')
  })

  it('escalate_to_montir returns success', async () => {
    const raw = await handleWorkshopTool({
      name: 'escalate_to_montir',
      args: {
        customer_name: 'Ani',
        summary: 'Rem blong mendadak',
        channel: 'web',
      },
    })
    const result = JSON.parse(raw)
    expect(result.success).toBe(true)
  })

  it('get_service_catalog returns services list', async () => {
    const raw = await handleWorkshopTool({ name: 'get_service_catalog', args: {} })
    const result = JSON.parse(raw)
    expect(result.services.length).toBeGreaterThan(0)
  })
})