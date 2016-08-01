'use strict';

const Connection       = require('../src/connection');
const MediaConnection  = require('../src/mediaConnection');

const assert      = require('power-assert');
const sinon       = require('sinon');
const proxyquire  = require('proxyquireify')(require);

describe('MeshRoom', () => {
  const meshRoomName = 'testMeshRoom';
  const peerId       = 'testId';
  const remotePeerId = 'differentTestId';
  const pcConfig     = {iceServers: []};
  const origStream   = {};

  let MeshRoom;
  let meshRoom;
  let mcStub;
  let dcStub;
  let onSpy;
  let closeSpy;

  beforeEach(() => {
    mcStub = sinon.stub();
    dcStub = sinon.stub();
    onSpy = sinon.spy();
    closeSpy = sinon.spy();

    mcStub.returns({
      on:    onSpy,
      close: closeSpy
    });

    dcStub.returns({
      on: onSpy
    });

    MeshRoom = proxyquire('../src/meshRoom', {'./mediaConnection': mcStub, './dataConnection': dcStub});
    meshRoom = new MeshRoom(meshRoomName, peerId, {stream: origStream, pcConfig: pcConfig});
  });

  afterEach(() => {
    mcStub.reset();
    dcStub.reset();
    onSpy.reset();
    closeSpy.reset();
  });

  describe('Constructor', () => {
    it('should create a MeshRoom Object with properties set', () => {
      assert(meshRoom);
      assert.equal(meshRoom.name, meshRoomName);
      assert.equal(meshRoom._peerId, peerId);
      assert.equal(meshRoom._localStream, origStream);
      assert.equal(meshRoom._pcConfig, pcConfig);
    });
  });

  describe('call', () => {
    it('should emit getPeers event', done => {
      meshRoom.on(MeshRoom.MESSAGE_EVENTS.getPeers.key, data => {
        assert.deepEqual(data, {roomName: meshRoomName, type: 'media'});
        done();
      });

      meshRoom.call();
    });

    it('should set _localStream', () => {
      const dummyStream = {};

      meshRoom.call(dummyStream);

      assert.equal(meshRoom._localStream, dummyStream);
    });
  });

  describe('connect', () => {
    it('should emit getPeers event', done => {
      meshRoom.on(MeshRoom.MESSAGE_EVENTS.getPeers.key, data => {
        assert.deepEqual(data, {roomName: meshRoomName, type: 'data'});
        done();
      });

      meshRoom.connect();
    });
  });

  describe('makeMediaConnections', () => {
    const remotePeerId1 = 'peerId1';
    const remotePeerId2 = 'peerId2';
    const peerIds = [remotePeerId1, remotePeerId2];

    it('should call _makeConnections', () => {
      const makeConnectionsStub = sinon.stub(meshRoom, '_makeConnections');

      meshRoom.makeMediaConnections(peerIds);

      assert.equal(makeConnectionsStub.callCount, 1);
      assert(makeConnectionsStub.calledWithMatch(peerIds, 'media', {pcConfig: pcConfig, stream: origStream}));
    });
  });

  describe('makeDataConnections', () => {
    const remotePeerId1 = 'peerId1';
    const remotePeerId2 = 'peerId2';
    const peerIds = [remotePeerId1, remotePeerId2];

    it('should call _makeConnections', () => {
      const makeConnectionsStub = sinon.stub(meshRoom, '_makeConnections');

      meshRoom.makeDataConnections(peerIds);

      assert.equal(makeConnectionsStub.callCount, 1);
      assert(makeConnectionsStub.calledWithMatch(peerIds, 'data', {pcConfig: pcConfig}));
    });
  });

  describe('handleJoin', () => {
    it('should emit peerJoin event', done => {
      const peerId1 = 'peerId1';
      const message = {src: peerId1};

      meshRoom.on(MeshRoom.EVENTS.peerJoin.key, peerId => {
        assert.equal(peerId, peerId1);

        done();
      });

      meshRoom.handleJoin(message);
    });
  });

  describe('handleLeave', () => {
    it('should call _deleteConnections and emit peerLeave event', done => {
      const message = {src: remotePeerId};

      meshRoom.on(MeshRoom.EVENTS.peerLeave.key, peerId => {
        assert.equal(peerId, remotePeerId);

        done();
      });

      meshRoom.handleLeave(message);
    });

    it('should call _deleteConnections', () => {
      const message = {src: remotePeerId};

      const deleteConnectionsStub = sinon.stub(meshRoom, '_deleteConnections');

      meshRoom.handleLeave(message);

      assert.equal(deleteConnectionsStub.callCount, 1);
      assert(deleteConnectionsStub.calledWith(remotePeerId));
    });
  });

  describe('handleOffer', () => {
    const connId1 = 'connId1';

    describe('when connectionType is media', () => {
      const data = {
        connectionId:   connId1,
        connectionType: 'media',
        src:            remotePeerId
      };

      it('should create new MediaConnection and add it to connections', () => {
        const addConnectionStub = sinon.stub(meshRoom, '_addConnection');

        meshRoom.handleOffer(data);

        assert.equal(mcStub.callCount, 1);
        assert(mcStub.calledWith(remotePeerId));

        assert(addConnectionStub.calledWith(remotePeerId, mcStub.returnValues[0]));
      });

      it('should emit a call event', done => {
        meshRoom.on(MeshRoom.EVENTS.call.key, call => {
          assert.equal(call, mcStub.returnValues[0]);

          done();
        });

        meshRoom.handleOffer(data);
      });

      it('should return without creating a connection if the id already exists', () => {
        meshRoom.on(MeshRoom.EVENTS.call.key, () => {
          assert.fail(undefined, undefined, 'Should not have emitted a call event');
        });

        meshRoom._addConnection(remotePeerId, {id: connId1});

        meshRoom.handleOffer(data);

        assert.equal(mcStub.callCount, 0);
      });
    });

    // TODO: when dataConnection messages is implemented?
    describe('when connectionType is data', () => {
      it('should create new DataConnection and add it to connections', () => {});
      it('should return without creating a connection if the id already exists', () => {});
    });

    describe('when connectionType is not media or data', () => {
      const data = {
        connectionId:   connId1,
        connectionType: 'foobar',
        src:            remotePeerId
      };

      it('should not create a media or data connection', () => {
        meshRoom.handleOffer(data);

        assert.equal(mcStub.callCount, 0);
        assert.equal(dcStub.callCount, 0);
      });
    });
  });

  describe('handleAnswer', () => {
    it('should call connection.handleAnswer method', () => {
      const connId1 = 'connId1';
      const handleSpy = sinon.spy();
      const connection1 = {id: connId1, handleAnswer: handleSpy};
      meshRoom._addConnection(remotePeerId, connection1);

      const answerMessage = {
        connectionId: connId1,
        src:          remotePeerId
      };
      meshRoom.handleAnswer(answerMessage);

      assert.equal(handleSpy.callCount, 1);
      console.log(handleSpy.args[0][0]);
      assert(handleSpy.calledWithMatch(answerMessage));
    });
  });

  describe('handleCandidate', () => {
    it('should call connection.handleCandidate method', () => {
      const connId1 = 'connId1';
      const handleSpy = sinon.spy();
      const connection1 = {id: connId1, handleCandidate: handleSpy};
      meshRoom._addConnection(remotePeerId, connection1);

      const candidateMessage = {
        connectionId: connId1,
        src:          remotePeerId
      };
      meshRoom.handleCandidate(candidateMessage);

      assert.equal(handleSpy.callCount, 1);
      assert(handleSpy.calledWithMatch(candidateMessage));
    });
  });

  describe('sendByWS', () => {
    it('should emit a broadcastByWS event', done => {
      const data = 'foobar';

      meshRoom.on(MeshRoom.MESSAGE_EVENTS.broadcastByWS.key, dataMessage => {
        assert.deepEqual(dataMessage, {roomName: meshRoomName, data: data});
        done();
      });

      meshRoom.sendByWS(data);
    });
  });

  describe('sendByDC', () => {
    it('should emit a broadcastByDC event', done => {
      const data = 'foobar';

      meshRoom.on(MeshRoom.MESSAGE_EVENTS.broadcastByDC.key, dataMessage => {
        assert.deepEqual(dataMessage, {roomName: meshRoomName, data: data});
        done();
      });

      meshRoom.sendByDC(data);
    });
  });

  describe('close', () => {
    it('should close all connections within the room and emit close and leave events', done => {
      meshRoom.makeMediaConnections(['peerId1', 'peerId2']);

      meshRoom.on(MeshRoom.EVENTS.close.key, () => {
        done();
      });

      meshRoom.close();

      assert(closeSpy.calledTwice);
    });
  });

  describe('_addConnection', () => {
    it('should add the connection to meshRoom.connections', () => {
      const connection1 = {};
      const connection2 = {};

      assert.equal(meshRoom[remotePeerId], undefined);

      meshRoom._addConnection(remotePeerId, connection1);
      assert.deepEqual(meshRoom.connections[remotePeerId], [connection1]);

      meshRoom._addConnection(remotePeerId, connection2);
      assert.deepEqual(meshRoom.connections[remotePeerId], [connection1, connection2]);
    });
  });

  describe('_makeConnections', () => {
    const remotePeerId1 = 'peerId1';
    const remotePeerId2 = 'peerId2';
    const peerIds = [remotePeerId1, remotePeerId2];

    describe('when type is data', () => {
      const options = {
        pcConfig: pcConfig
      };

      it('should create a DataConnection for each peerId', () => {
        meshRoom._makeConnections(peerIds, 'data', options);

        assert.equal(dcStub.callCount, peerIds.length);
        assert(dcStub.calledWith(remotePeerId1));
        assert(dcStub.calledWith(remotePeerId2));
      });

      it('should call addConnection and setupMessageHandlers for each connection', () => {
        const addConnectionStub = sinon.stub(meshRoom, '_addConnection');
        const setupMessageHandlersStub = sinon.stub(meshRoom, '_setupMessageHandlers');

        meshRoom._makeConnections(peerIds, 'data', options);

        assert.equal(addConnectionStub.callCount, peerIds.length);
        assert.equal(setupMessageHandlersStub.callCount, peerIds.length);

        for (let i = 0; i < peerIds.length; i++) {
          const peerId = peerIds[i];
          const dc = dcStub.returnValues[i];
          assert(addConnectionStub.calledWith(peerId), dc);
          assert(setupMessageHandlersStub.calledWith(dc));
        }
      });

      it('should not create DataConnection for yourself', () => {
        const peerIds = [remotePeerId1, peerId, remotePeerId2];

        meshRoom._makeConnections(peerIds, 'data', options);

        assert(dcStub.neverCalledWith(peerId));
      });
    });

    describe('when type is media', () => {
      const options = {
        pcConfig: pcConfig,
        stream:   origStream
      };

      it('should create a MediaConnection for each peerId', () => {
        meshRoom._makeConnections(peerIds, 'media', options);

        assert.equal(mcStub.callCount, peerIds.length);
        assert(mcStub.calledWith(remotePeerId1));
        assert(mcStub.calledWith(remotePeerId2));
      });

      it('should call addConnection and setupMessageHandlers for each connection', () => {
        const addConnectionStub = sinon.stub(meshRoom, '_addConnection');
        const setupMessageHandlersStub = sinon.stub(meshRoom, '_setupMessageHandlers');

        meshRoom._makeConnections(peerIds, 'media', options);

        assert.equal(addConnectionStub.callCount, peerIds.length);
        assert.equal(setupMessageHandlersStub.callCount, peerIds.length);

        for (let i = 0; i < peerIds.length; i++) {
          const peerId = peerIds[i];
          const mc = mcStub.returnValues[i];
          assert(addConnectionStub.calledWith(peerId), mc);
          assert(setupMessageHandlersStub.calledWith(mc));
        }
      });

      it('should not create MediaConnection for yourself', () => {
        const peerIds = [remotePeerId1, peerId, remotePeerId2];

        meshRoom._makeConnections(peerIds, 'media', options);

        assert(mcStub.neverCalledWith(peerId));
      });
    });
  });

  describe('_deleteConnections', () => {
    it('should delete connections from connections property', () => {
      const connection1 = 'connection1';
      const connection2 = 'connection2';

      meshRoom._addConnection(remotePeerId, connection1);
      meshRoom._addConnection(remotePeerId, connection2);

      assert(meshRoom.connections[remotePeerId].length, 2);

      meshRoom._deleteConnections(remotePeerId);
      assert.equal(meshRoom.connections[remotePeerId], undefined);
    });
  });

  describe('_getConnection', () => {
    const peerId1 = 'peerId1';
    const peerId2 = 'peerId2';
    const connId1 = 'connId1';
    const connId2 = 'connId2';
    const connection1 = {id: connId1};
    const connection2 = {id: connId2};

    beforeEach(() => {
      meshRoom._addConnection(peerId1, connection1);
      meshRoom._addConnection(peerId2, connection2);
    });

    it('should get a connection according to given peerId and connectionId', () => {
      assert.equal(meshRoom._getConnection(peerId1, connId1), connection1);
      assert.equal(meshRoom._getConnection(peerId2, connId2), connection2);
    });

    it('should get null if the peerId/connectionId combination doesn\'t exist', () => {
      assert.equal(meshRoom._getConnection(peerId1, connId2), null);
      assert.equal(meshRoom._getConnection(peerId2, connId1), null);
    });
  });

  describe('_setupMessageHandlers', () => {
    it('should set up message handlers', () => {
      meshRoom._setupMessageHandlers({on: onSpy});

      assert(onSpy.calledWith(Connection.EVENTS.offer.key, sinon.match.func));
      assert(onSpy.calledWith(Connection.EVENTS.answer.key, sinon.match.func));
      assert(onSpy.calledWith(Connection.EVENTS.candidate.key, sinon.match.func));
    });

    it('should handle stream event if connection is a MediaConnection', () => {
      meshRoom._setupMessageHandlers({on: onSpy, type: 'media'});

      assert(onSpy.calledWith(MediaConnection.EVENTS.stream.key, sinon.match.func));
    });

    describe('Event handlers', () => {
      const remoteId = 'remoteId';
      let mc;

      beforeEach(() => {
        mc = new MediaConnection(remoteId);
        meshRoom._setupMessageHandlers(mc);
      });

      describe('offer', () => {
        it('should emit offer message including room name', done => {
          const offer = {};
          const offerMessage = {
            offer: offer
          };

          meshRoom.on(MeshRoom.MESSAGE_EVENTS.offer.key, emittedOfferMessage => {
            assert.equal(emittedOfferMessage.offer, offer);
            assert.equal(emittedOfferMessage.roomName, meshRoomName);

            done();
          });

          mc.emit(Connection.EVENTS.offer.key, offerMessage);
        });
      });

      describe('answer', () => {
        it('should emit answer message including room name', done => {
          const answer = {};
          const answerMessage = {
            answer: answer
          };

          meshRoom.on(MeshRoom.MESSAGE_EVENTS.answer.key, emittedAnswerMessage => {
            assert.equal(emittedAnswerMessage.answer, answer);
            assert.equal(emittedAnswerMessage.roomName, meshRoomName);

            done();
          });

          mc.emit(Connection.EVENTS.answer.key, answerMessage);
        });
      });

      describe('candidate', () => {
        it('should emit candidate message including room name', done => {
          const candidate = {};
          const candidateMessage = {
            candidate: candidate
          };

          meshRoom.on(MeshRoom.MESSAGE_EVENTS.candidate.key, emittedCandidateMessage => {
            assert.equal(emittedCandidateMessage.candidate, candidate);
            assert.equal(emittedCandidateMessage.roomName, meshRoomName);

            done();
          });

          mc.emit(Connection.EVENTS.candidate.key, candidateMessage);
        });
      });

      describe('stream', () => {
        it('should emit stream with peerId', done => {
          const stream = {};

          meshRoom.on(MeshRoom.EVENTS.stream.key, emittedStream => {
            assert.equal(emittedStream, stream);
            assert.equal(emittedStream.peerId, remoteId);

            done();
          });

          mc.emit(MediaConnection.EVENTS.stream.key, stream);
        });
      });
    });
  });

  /** Inherited from Room */
  describe('handleData', () => {
    it('should emit a data event', done => {
      const message = {
        data: 'foobar',
        src:  remotePeerId
      };

      meshRoom.on(MeshRoom.EVENTS.data.key, receivedMessage => {
        assert.deepEqual(receivedMessage, message);

        done();
      });

      meshRoom.handleData(message);
    });
  });

  describe('handleLog', () => {
    it('should emit a log event', done => {
      const testLog = Symbol();

      meshRoom.on('log', log => {
        assert.equal(log, testLog);
        done();
      });
      meshRoom.handleLog(testLog);
    });
  });

  describe('getLog', () => {
    it('should emit a getLog event', done => {
      meshRoom.on(MeshRoom.MESSAGE_EVENTS.getLog.key, () => {
        done();
      });

      meshRoom.getLog();
    });
  });
});