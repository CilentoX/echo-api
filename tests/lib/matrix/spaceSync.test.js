import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock matrix-js-sdk client module
vi.mock('@/lib/matrix/client.js', () => ({
  getMatrixClient: vi.fn(),
}))

import { getMatrixClient } from '@/lib/matrix/client.js'
import * as spaceSync from '@/lib/matrix/spaceSync.js'

describe('spaceSync - Matrix Space/Room operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createSpace', () => {
    it('should create a Matrix Space and return spaceId', async () => {
      const mockClient = {
        createRoom: vi.fn().mockResolvedValue('!room123:matrix'),
      }
      vi.mocked(getMatrixClient).mockReturnValue(mockClient)

      const spaceId = await spaceSync.createSpace('token', 'Test Space', 'Test topic')

      expect(spaceId).toBe('!room123:matrix')
      expect(getMatrixClient).toHaveBeenCalledWith('', 'token')
    })
  })

  describe('updateSpace', () => {
    it('should update Matrix Space settings', async () => {
      const mockClient = {
        setRoomState: vi.fn().mockResolvedValue(undefined),
      }
      vi.mocked(getMatrixClient).mockReturnValue(mockClient)

      await spaceSync.updateSpace('token', '!space123:matrix', 'New Name', 'New topic')

      expect(mockClient.setRoomState).toHaveBeenCalled()
    })
  })

  describe('deleteSpace', () => {
    it('should leave and forget the Matrix Space', async () => {
      const mockClient = {
        leaveRoom: vi.fn().mockResolvedValue(undefined),
        forgetRoom: vi.fn().mockResolvedValue(undefined),
      }
      vi.mocked(getMatrixClient).mockReturnValue(mockClient)

      await spaceSync.deleteSpace('token', '!space123:matrix')

      expect(mockClient.leaveRoom).toHaveBeenCalled()
      expect(mockClient.forgetRoom).toHaveBeenCalled()
    })
  })

  describe('createRoom', () => {
    it('should create a child room within a Matrix Space', async () => {
      const mockClient = {
        createRoom: vi.fn().mockResolvedValue('!childroom:matrix'),
      }
      vi.mocked(getMatrixClient).mockReturnValue(mockClient)

      const roomId = await spaceSync.createRoom('token', '!space123:matrix', 'Child Room')

      expect(roomId).toBe('!childroom:matrix')
    })
  })

  describe('updateRoom', () => {
    it('should update a child room within a Matrix Space', async () => {
      const mockClient = {
        setRoomState: vi.fn().mockResolvedValue(undefined),
      }
      vi.mocked(getMatrixClient).mockReturnValue(mockClient)

      await spaceSync.updateRoom('token', '!room123:matrix', 'New Name')

      expect(mockClient.setRoomState).toHaveBeenCalled()
    })
  })

  describe('deleteRoom', () => {
    it('should leave and forget the Matrix Room', async () => {
      const mockClient = {
        leaveRoom: vi.fn().mockResolvedValue(undefined),
        forgetRoom: vi.fn().mockResolvedValue(undefined),
      }
      vi.mocked(getMatrixClient).mockReturnValue(mockClient)

      await spaceSync.deleteRoom('token', '!room123:matrix')

      expect(mockClient.leaveRoom).toHaveBeenCalled()
      expect(mockClient.forgetRoom).toHaveBeenCalled()
    })
  })
})
