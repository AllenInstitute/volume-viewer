export class vrObjectControls {
    constructor(controller1, controller2, object) {
        this.controller1 = controller1;
        this.controller2 = controller2;
        this.object = object;

        this.trigger1Down = this.controller1.getButtonState('trigger');
        this.trigger2Down = this.controller2.getButtonState('trigger');
        
        // really only used once per update() call.
        this.scale = new THREE.Vector3();
        this.previousDist = null;

        // one channel index per hand
        this.currentChannel = [0,-1];
    }

    setObject(obj) {
        this.object = obj;
    }

    onEnterVR() {
        this.onMenu1 = (function() {
            this.cycleChannels(0);
        }).bind(this);
        this.onMenu2 = (function() {
            this.cycleChannels(1);
        }).bind(this);
        this.onAxisChange = this.onAxisChange.bind(this);
        this.controller1.addEventListener('menuup', this.onMenu1);
        this.controller2.addEventListener('menuup', this.onMenu2);
        this.controller1.addEventListener('axischanged', this.onAxisChange);
        this.controller2.addEventListener('axischanged', this.onAxisChange);
    
    }

    onLeaveVR() {
        this.controller1.removeEventListener('menuup', this.onMenu1);
        this.controller2.removeEventListener('menuup', this.onMenu2);
        this.resetObject();
    }

    onAxisChange(obj) {
        if (!this.object) {
            return;
        }
        //console.log(obj.axes);
        // ignore events precisely at 0,0?
        if (obj.axes[0] === 0 && obj.axes[1] === 0) {
            return;
        }
        // 0..1
        const x = 0.5*(obj.axes[0]+1.0);
        const y = 0.5*(obj.axes[1]+1.0);
        this.object.setBrightness(x);
        this.object.setDensity(y);
    }

    cycleChannels(i) {
        if (!this.object) {
            return;
        }

        this.currentChannel[i]++;
        if (this.currentChannel[i] >= this.object.num_channels) {
            this.currentChannel[i] = 0;
        }
        // this will switch off all channels except this.currentChannels
        for (let i = 0; i < this.object.num_channels; ++i ) {
            this.object.setVolumeChannelEnabled(i, i === this.currentChannel[0] || i === this.currentChannel[1]);
        }
        this.object.fuse();
    };

    update() {
        const isTrigger1Down = this.controller1.getButtonState('trigger');
        const isTrigger2Down = this.controller2.getButtonState('trigger');
        const rotating = (isTrigger1Down && !isTrigger2Down) || (isTrigger2Down && !isTrigger1Down);
        const theController = isTrigger1Down ? this.controller1 : this.controller2;
        const zooming = isTrigger1Down && isTrigger2Down;

        if (rotating) {
            if ((!this.trigger1Down && isTrigger1Down) || (!this.trigger2Down && isTrigger2Down)) {
                this.VRrotate = true;
                this.VRrotateStartPos = new THREE.Vector3().setFromMatrixPosition(theController.matrix);
            }
        }
        if ((this.trigger1Down && !isTrigger1Down) || (this.trigger2Down && !isTrigger2Down))  {
            this.VRrotate = false;
        }    
        if (this.object && zooming) {
            let obj3d = this.object.sceneRoot;
            this.VRzoom = true;

            this.scale.copy(obj3d.scale);

            const p1 = new THREE.Vector3().setFromMatrixPosition(this.controller1.matrix);
            const p2 = new THREE.Vector3().setFromMatrixPosition(this.controller2.matrix);
            const dist = p1.distanceTo(p2);
            if (!this.wasZooming) {
                this.VRzoomStart = 0;
                this.VRzoomdist = dist;
            }

            let deltaStretch = 1.0;
            if (this.previousDist !== null && dist !== 0) {
                deltaStretch = dist / this.previousDist;
            }
            this.previousDist = dist;
            this.scale.multiplyScalar(deltaStretch);

            const ZOOM_MAX = 2.0;
            const ZOOM_MIN = 0.25;
            obj3d.scale.x = Math.min(ZOOM_MAX, Math.max( this.scale.x, ZOOM_MIN));
            obj3d.scale.y = Math.min(ZOOM_MAX, Math.max( this.scale.y, ZOOM_MIN));
            obj3d.scale.z = Math.min(ZOOM_MAX, Math.max( this.scale.z, ZOOM_MIN));
        }
        else {
            this.VRzoom = false;
            this.previousDist = null;
        }

        if (this.object && this.VRrotate) {
            let obj3d = this.object.sceneRoot;

            // dist from last pose position in x and z.
            var pos = new THREE.Vector3().setFromMatrixPosition(theController.matrix);

            var origin = obj3d.position;

            var v0 = new THREE.Vector3().subVectors(this.VRrotateStartPos, origin);
            v0 = v0.normalize();
            var v1 = new THREE.Vector3().subVectors(pos, origin);
            v1 = v1.normalize();

            var mio = new THREE.Matrix4();
            mio.getInverse(obj3d.matrixWorld);

            v0 = v0.transformDirection(mio);
            v0 = v0.normalize();
            v1 = v1.transformDirection(mio);
            v1 = v1.normalize();

            var q = new THREE.Quaternion();
            q.setFromUnitVectors(v0, v1);

            obj3d.quaternion.multiply(q);

            this.VRrotateStartPos.set(pos.x, pos.y, pos.z);
        }
        this.trigger1Down = isTrigger1Down;
        this.trigger2Down = isTrigger2Down;
        this.wasZooming = zooming;
    }

    resetObject() {
        if (this.object) {
            this.object.sceneRoot.quaternion.setFromAxisAngle(new THREE.Vector3(0,0,1), 0.0);
        }
    }
};

export default vrObjectControls;
