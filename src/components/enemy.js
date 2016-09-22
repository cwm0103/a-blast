/* global AFRAME THREE TWEEN warn */
AFRAME.registerComponent('music', {
  schema: {
    src: { default: '' },
    on: { default: 'click' },
    autoplay: { default: false },
    loop: { default: false },
    volume: { default: 1 }
  },

  init: function () {
    this.listener = null;
    this.sound = null;
  },

  update: function (oldData) {
    console.log(oldData);
    var data = this.data;
    var el = this.el;
    var sound = this.sound;
    var srcChanged = data.src !== oldData.src;

    // Create new sound if not yet created or changing `src`.
    if (srcChanged) {
      if (!data.src) {
        warn('Audio source was not specified with `src`');
        return;
      }
      sound = this.setupSound();
    }

    sound.autoplay = data.autoplay;
    sound.setLoop(data.loop);
    sound.setVolume(data.volume);

    if (data.on !== oldData.on) {
      if (oldData.on) { el.removeEventListener(oldData.on); }
      el.addEventListener(data.on, this.play.bind(this));
    }

    // All sound values set. Load in `src`.
    if (srcChanged) { sound.load(data.src); }
  },

  remove: function () {
    this.el.removeObject3D('sound');
    try {
      this.sound.disconnect();
    } catch (e) {
      // disconnect() will throw if it was never connected initially.
      warn('Audio source not properly disconnected');
    }
  },

  /**
   * Removes current sound object, creates new sound object, adds to entity.
   *
   * @returns {object} sound
   */
  setupSound: function () {
    var el = this.el;
    var sceneEl = el.sceneEl;
    var sound = this.sound;

    if (sound) {
      this.stop();
      el.removeObject3D('sound');
    }

    // Only want one AudioListener. Cache it on the scene.
    var listener = this.listener = sceneEl.audioListener || new THREE.AudioListener();
    sceneEl.audioListener = listener;

    if (sceneEl.camera) {
      sceneEl.camera.add(listener);
    }

    // Wait for camera if necessary.
    sceneEl.addEventListener('camera-set-active', function (evt) {
      evt.detail.cameraEl.getObject3D('camera').add(listener);
    });

    sound = this.sound = new THREE.Audio(listener);
    el.setObject3D('sound', sound);

    sound.source.onended = function () {
      sound.onEnded();
      el.emit('sound-ended');
    };

    return sound;
  },

  play: function () {
    if (!this.sound.source.buffer) { return; }
    this.sound.play();
  },

  stop: function () {
    if (!this.sound.source.buffer) { return; }
    this.sound.stop();
  },

  pause: function () {
    if (!this.sound.source.buffer || !this.sound.isPlaying) { return; }
    this.sound.pause();
  }
});

AFRAME.registerSystem('enemy', {
  init: function () {
    this.enemies = [];
    document.querySelector('a-scene').addEventListener('game-over', function () {
      console.log('Enemyessss gameover');
    });

    this.createNewEnemy();
    this.createNewEnemy();
    this.createNewEnemy();
  },
  tick: function (time, delta) {
  },
  createNewEnemy: function () {
    var entity = document.createElement('a-entity');
    var radius = 13;
    var angle = Math.random() * Math.PI * 2;
    var dist = radius * Math.sqrt(Math.random());
    var point = [ dist * Math.cos(angle),
                  dist * Math.sin(angle),
                  Math.sqrt(radius * radius - dist * dist)];
    if (point[1] < 0) {
      // point[1] = -point[1];
    }

    var game = document.querySelector('a-scene').getAttribute('game');
    var points = game.points || 0;
    var level = parseInt(points / 10, 10);
    var waitingTime = 5000 - (Math.random() * 2 + level) * 500;
    if (waitingTime < 2000) {
      waitingTime = 2000;
    }

    // Easy
    var bulletSpeed = 6 + Math.random() * level * 0.5;
    if (bulletSpeed > 8) {
      bulletSpeed = 8;
    }

    var chargingDuration = 6000 - level * 500;
    if (chargingDuration < 4000) {
      chargingDuration = 4000;
    }
    console.log(bulletSpeed, waitingTime, chargingDuration);

    entity.setAttribute('enemy', {
      lifespan: 6 * (Math.random()) + 1,
      waitingTime: waitingTime,
      startPosition: {x: point[0], y: -10, z: point[2]},
      endPosition: {x: point[0], y: point[1], z: point[2]},
      chargingDuration: chargingDuration,
      bulletSpeed: bulletSpeed
    });

    this.sceneEl.appendChild(entity);

    // this.enemies.push(entity);

    entity.setAttribute('position', {x: point[0], y: -10, z: point[2]});
    // entity.setAttribute('geometry', {primitive: 'icosahedron', radius: 1, detail: 1});
    // entity.setAttribute('obj-model', {obj: 'url(mydroid2.obj)', mtl: 'url(mydroid2.mtl)'});
    entity.setAttribute('obj-model', {obj: '#droid-obj', mtl: '#droid-mtl'});

    // entity.setAttribute('material', {shader: 'standard', color: '#ff9', transparent: 'true', opacity: 0.5, flatshading: true});
    entity.setAttribute('material', {shader: 'standard', color: '#ff9', transparent: 'true', opacity: 1.0, flatshading: true});

    // console.log(document.getElementById('droid').object3D.children[0]);
    // entity.el.object3D = document.getElementById('droid').getObject3D('mesh');
  }
});

AFRAME.registerComponent('enemy', {
  schema: {
    active: { default: true }
  },

  deactivate: function () {
    this.active = false;
    this.visible = false;
  },
  activate: function () {
    this.active = true;
    this.visible = true;
  },
  init: function () {
    this.state = 'appearing';
    this.system.enemies.push(this);
    this.life = this.data.lifespan;
    this.waitingTime = this.data.waitingTime;
    this.alive = true;
    this.chargingDuration = this.data.chargingDuration;

    this.exploding = false;
    this.el.addEventListener('hit', this.collided.bind(this));
    // @todo Maybe we could send the time in init?
    this.statusChangeTime = this.time = this.el.sceneEl.time;

    this.soundExplosion = document.createElement('a-entity');
    this.soundExplosion.setAttribute('sound', {
      src: 'sounds/explosion0.ogg',
      on: 'enemy-hit',
      volume: 0.15
    });
    this.soundExplosion.addEventListener('loaded', function () {
      this.el.emit('appearing');
    }.bind(this));
    this.el.appendChild(this.soundExplosion);

    this.soundCharging = document.createElement('a-entity');
    this.soundCharging.setAttribute('sound', {
      src: 'sounds/whoosh0.ogg',
      on: 'charging',
      off: 'shooting',
      volume: 0.5
    });
    this.el.appendChild(this.soundCharging);

    this.soundShooting = document.createElement('a-entity');
    this.soundShooting.setAttribute('sound', {
      src: 'sounds/laser0.ogg',
      on: 'shooting',
      volume: 0.15
    });
    this.el.appendChild(this.soundShooting);
    this.soundAppearing = document.createElement('a-entity');
    this.soundAppearing.setAttribute('sound', {
      src: 'sounds/robots0.ogg',
      on: 'appearing',
      volume: 0.4
    });
    this.soundAppearing.addEventListener('loaded', function () {
      this.el.emit('appearing');
    }.bind(this));
  },
  collided: function () {
    if (this.exploding) {
      return;
    }

    this.el.emit('enemy-hit');
    this.soundExplosion.emit('enemy-hit');

    this.shoot();
    // var mesh = this.el.getObject3D('mesh');
    // mesh.material.color.setHex(0xff0000);
    // this.explodingTime = this.el.sceneEl.time;
    var children = this.el.getObject3D('mesh').children;
    for (var i = 0; i < children.length; i++) {
      // children[i].explodingDirection = new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize();
      children[i].explodingDirection = new THREE.Vector3(
        2 * Math.random() - 1,
        2 * Math.random() - 1,
        2 * Math.random() - 1);
      children[i].startPosition = children[i].position.clone();
      children[i].endPosition = children[i].position.clone().add(children[i].explodingDirection.clone().multiplyScalar(3));
    }
    this.exploding = true;
  },
  die: function () {
    this.alive = false;
    this.removeAll();
    this.system.createNewEnemy();
  },

  shoot: function (time) {
    this.soundCharging.emit('shooting');
    this.soundShooting.emit('shooting');
    console.info('shooting');
    this.statusChangeTime = time;

    var entity = document.createElement('a-entity');
    var direction = this.el.object3D.position.clone();
    var head = this.el.sceneEl.camera.el.components['look-controls'].dolly.position.clone();
    direction = head.sub(direction).normalize();

    entity.setAttribute('enemybullet', {direction: direction, position: this.el.object3D.position, speed: this.data.bulletSpeed});
    entity.setAttribute('position', this.el.object3D.position);
    entity.setAttribute('geometry', {primitive: 'icosahedron', radius: 0.08, detail: 0});
    entity.setAttribute('material', {shader: 'standard', flatShading: true, color: '#f00'});
    this.el.sceneEl.appendChild(entity);
  },
  removeAll: function () {
    var index = this.system.enemies.indexOf(this);
    this.system.enemies.splice(index, 1);
    this.el.parentElement.removeChild(this.el);
  },
  charge: function (time) {
    console.log('charging');
    this.statusChangeTime = time;
    this.state = 'charging';
    this.soundCharging.emit('charging');
  },
  tick: function (time, delta) {
    var game = document.querySelector('a-scene').getAttribute('game');
    if (game && game.state === 'game-over') {
      return;
    }

    // if (!this.alive || !this.active) {
    if (!this.alive) {
      return;
    }
    var statusTimeOffset = time - this.statusChangeTime;

    if (this.exploding) {
      if (!this.explodingTime) {
        this.explodingTime = time;
      }
      var duration = 3000;
      var t0 = (time - this.explodingTime) / duration;
      var children = this.el.getObject3D('mesh').children;
      var t = TWEEN.Easing.Exponential.Out(t0);

      for (var i = 0; i < children.length; i++) {
        // t = TWEEN.Easing.Exponential.Out(t);
        var pos = children[i].startPosition.clone();
        children[i].position.copy(children[i].startPosition.clone().lerp(children[i].endPosition, t));
        var dur = 1 - t;
        children[i].scale.set(dur, dur, dur);
        children[i].material.opacity = (1 - t0);
        children[i].material.transparent = true;
      }
      if (t0 >= 1) {
        this.die();
      }
      return;
    }

    // var timeOffset = time - this.time;

    // console.log(this.state, time.toFixed(2), statusTimeOffset.toFixed(2));

    if (this.state === 'appearing') {
      duration = 2000;
      t = statusTimeOffset / duration;
      pos = new THREE.Vector3(this.data.startPosition.x, this.data.startPosition.y, this.data.startPosition.z);
      t = TWEEN.Easing.Back.Out(t);
      pos.lerp(this.data.endPosition, t);
      this.el.setAttribute('position', pos);

      if (statusTimeOffset >= duration) {
        this.charge(time);
      }
    } else if (this.state === 'charging') {
      var offset = statusTimeOffset / this.chargingDuration;
      var sca = offset / 2 + 1 + Math.random() * 0.1;
      this.el.setAttribute('scale', {x: sca, y: sca, z: sca});
      if (statusTimeOffset >= this.chargingDuration) {
        this.state = 'shooting';
        // this.el.setAttribute('scale', {x: 1, y: 1, z: 1});
        this.currentScale = sca;

        this.shootingBackPosition = new THREE.Vector3(
          this.data.endPosition.x,
          this.data.endPosition.y,
          this.data.endPosition.z)
          .multiplyScalar(1.1);

        this.shoot(time);
      }
    } else if (this.state === 'shooting') {
      var shootingAnimationDuration = 1000;
      offset = statusTimeOffset / shootingAnimationDuration;
      if (offset <= 1.0) {
        /*
        offset = offset;
        var sca = this.currentScale * (1-offset);
        if (sca < 1.0) {
          sca= 1.0;
        }
        */
        sca = 1;

        this.el.setAttribute('scale', {x: sca, y: sca, z: sca});

        offset = TWEEN.Easing.Exponential.Out(offset);
        pos = this.shootingBackPosition.clone();
        offset = Math.sin(offset * Math.PI);
        offset = 1 - offset;
        pos.lerp(this.data.endPosition, offset);
        this.el.setAttribute('position', pos);
      }

      if (this.waitingTime > 0) {
        this.waitingTime -= delta;
        if (this.waitingTime <= 0) {
          this.charge(time);
          this.waitingTime = this.data.waitingTime;
        }
      }
    }

    // Make the droid to look the headset
    var head = this.el.sceneEl.camera.el.components['look-controls'].dolly.position.clone();
    this.el.object3D.lookAt(head);
  },

  update: function () {
  },

  remove: function () {
/*    if (!this.model) { return; }
    this.el.removeObject3D('mesh');*/
  }
});