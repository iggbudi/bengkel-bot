import { describe, expect, it } from 'vitest'
import { BookingRepo, ConversationRepo, CustomerRepo } from './schema.js'
import { useIsolatedTestDb } from '../test/db-helper.js'

describe('database repositories', () => {
  useIsolatedTestDb()

  it('CustomerRepo upserts by phone', () => {
    const first = CustomerRepo.upsert({
      workshop_id: 'default',
      name: 'Siti',
      phone: '628111111111',
      car_model: 'Brio',
      plate_number: 'B 0001 AA',
    })
    const second = CustomerRepo.upsert({
      workshop_id: 'default',
      name: 'Siti Updated',
      phone: '628111111111',
      car_model: 'Brio',
      plate_number: 'B 0001 AA',
    })
    expect(second.id).toBe(first.id)
    expect(second.name).toBe('Siti Updated')
  })

  it('BookingRepo creates and updates status', () => {
    const booking = BookingRepo.create({
      workshop_id: 'default',
      customer_id: null,
      service_type: 'Ganti Oli',
      description: 'Rutin',
      plate_number: 'D 3333 CC',
      car_model: 'Xenia',
      estimate_low: null,
      estimate_high: null,
      final_price: null,
      booked_at: null,
      status: 'pending',
    })

    BookingRepo.updateStatus(booking.id, 'done', 'Selesai')
    expect(BookingRepo.findByPlate('D 3333 CC')?.status).toBe('done')
  })

  it('ConversationRepo upserts messages and preserves customer_id', () => {
    const customer = CustomerRepo.upsert({
      workshop_id: 'default',
      name: 'Rina',
      phone: '628222222222',
      car_model: null,
      plate_number: null,
    })

    ConversationRepo.upsert({
      id: 'c1',
      workshop_id: 'default',
      customer_id: customer.id,
      channel: 'web',
      chat_id: 'web:abc12345678901',
      messages: [{ role: 'user', content: 'Halo' }],
      escalated: false,
      last_message_at: null,
    })

    ConversationRepo.upsert({
      id: 'c2',
      workshop_id: 'default',
      customer_id: null,
      channel: 'web',
      chat_id: 'web:abc12345678901',
      messages: [
        { role: 'user', content: 'Halo' },
        { role: 'assistant', content: 'Hai' },
      ],
      escalated: false,
      last_message_at: null,
    })

    const messages = ConversationRepo.getMessages('web:abc12345678901', 'web')
    expect(messages).toHaveLength(2)
    expect(ConversationRepo.getCustomerId('web:abc12345678901', 'web')).toBe(customer.id)
  })

  it('ConversationRepo linkCustomer updates customer_id', () => {
    ConversationRepo.upsert({
      id: 'c3',
      workshop_id: 'default',
      customer_id: null,
      channel: 'web',
      chat_id: 'web:link-test-123456',
      messages: [],
      escalated: false,
      last_message_at: null,
    })

    const customer = CustomerRepo.upsert({
      workshop_id: 'default',
      name: 'Dewi',
      phone: '628333333333',
      car_model: null,
      plate_number: null,
    })

    ConversationRepo.linkCustomer('web:link-test-123456', 'web', customer.id)
    expect(ConversationRepo.getCustomerId('web:link-test-123456', 'web')).toBe(customer.id)
  })
})