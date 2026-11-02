import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock matrix-js-sdk client
vi.mock('@/lib/matrix/client.js', () => ({
  getMatrixClient: function () { },
}))

import * as spaceSync from '../../../../src/lib/matrix/spaceSync.js'

describe('spaceSync - Matrix Space/Room operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createSpace', () => {
    it('should create a Matrix Space and return spaceId', async () => {
      const mockClient = {
        createRoom: function () { return Promise.resolve('!room123:matrix') },
      }
      spaceSync.getMatrixClient = function () { return mockClient }

      const spaceId = await spaceSync.createSpace('token', 'Test Space', 'Test topic')

      expect(spaceId).toBe('!room123:matrix')
    })
  })

  describe('updateSpace', () => {
    it('should update Matrix Space settings', async () => {
      const mockClient = {
        setRoomState: function () { },
      }
      spaceSync.getMatrixClient = function () { return mockClient }

      await spaceSync.updateSpace('token', '!space123:matrix', 'New Name', 'New topic')

      expect(mockClient.setRoomState).toHaveBeenCalled()
    })
  })

  describe('deleteSpace', () => {
    it('should leave and forget the Matrix Space', async () => {
      const mockClient = {
        leaveRoom: function () { },
        forgetRoom: function () { },
      }
      spaceSync.getMatrixClient = function () { return mockClient }

      await spaceSync.deleteSpace('token', '!space123:matrix')

      expect(mockClient.leaveRoom).toHaveBeenCalled()
      expect(mockClient.forgetRoom).toHaveBeenCalled()
    })
  })

  describe('createRoom', () => {
    it('should create a child room within a Matrix Space', async () => {
      const mockClient = {
        createRoom: function () { return Promise.resolve('!childroom:matrix') },
      }
      spaceSync.getMatrixClient = function () { return mockClient }

      const roomId = await spaceSync.createRoom('token', '!space123:matrix', 'Child Room')

      expect(roomId).toBe('!childroom:matrix')
    })
  })

  describe('updateRoom', () => {
    it('should update a child room within a Matrix Space', async () => {
      const mockClient = {
        setRoomState: function () { },
      }
      spaceSync.getMatrixClient = function () { return mockClient }

      await spaceSync.updateRoom('token', '!room123:matrix', 'New Name')

      expect(mockClient.setRoomState).toHaveBeenCalled()
    })
  })

  describe('deleteRoom', () => {
    it('should leave and forget the Matrix Room', async () => {
      const mockClient = {
        leaveRoom: function () { },
        forgetRoom: function () { },
      }
      spaceSync.getMatrixClient = function () { return mockClient }

      await spaceSync.deleteRoom('token', '!room123:matrix')

      expect(mockClient.leaveRoom).toHaveBeenCalled()
      expect(mockClient.forgetRoom).toHaveBeenCalled()
    })
  })
})