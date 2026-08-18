/**
 * Spicy AMLL Player — Spring Physics Solver
 * Direct port of AMLL (amll-dev/applemusic-like-lyrics) utils/spring.ts
 * Uses pushkine/spring analytical harmonic oscillator solver with delay queue & derivative velocity tracking.
 */

function derivative(f) {
  const h = 0.001;
  return (x) => (f(x + h) - f(x - h)) / (2 * h);
}

function getVelocity(f) {
  return derivative(f);
}

function solveSpring(from, velocity, to, delay = 0, params) {
  const soft = params?.soft ?? false;
  const stiffness = params?.stiffness ?? 100;
  const damping = params?.damping ?? 10;
  const mass = params?.mass ?? 1;
  const delta = to - from;

  if (soft || 1.0 <= damping / (2.0 * Math.sqrt(stiffness * mass))) {
    const angular_frequency = -Math.sqrt(stiffness / mass);
    const leftover = -angular_frequency * delta - velocity;
    return (t) => {
      t -= delay;
      if (t < 0) return from;
      return to - (delta + t * leftover) * Math.exp(t * angular_frequency);
    };
  }

  const damping_frequency = Math.sqrt(4.0 * mass * stiffness - damping ** 2.0);
  const leftover = (damping * delta - 2.0 * mass * velocity) / damping_frequency;
  const dfm = (0.5 * damping_frequency) / mass;
  const dm = -(0.5 * damping) / mass;

  return (t) => {
    t -= delay;
    if (t < 0) return from;
    return (
      to -
      (Math.cos(t * dfm) * delta + Math.sin(t * dfm) * leftover) *
        Math.exp(t * dm)
    );
  };
}

export default class Spring {
  constructor(currentPosition = 0, stiffness = 100, damping = 10, mass = 1) {
    this.targetPosition = currentPosition;
    this.currentPosition = currentPosition;
    this.currentTime = 0;
    this.params = { stiffness, damping, mass };
    this.currentSolver = () => this.targetPosition;
    this.getV = () => 0;
    this.getV2 = () => 0;
    this.queueParams = undefined;
    this.queuePosition = undefined;
  }

  get position() {
    return this.currentPosition;
  }

  set position(v) {
    this.setPosition(v);
  }

  get velocity() {
    return this.getV(this.currentTime);
  }

  get goal() {
    return this.targetPosition;
  }

  set goal(v) {
    this.setTargetPosition(v, 0);
  }

  resetSolver() {
    const curV = this.getV(this.currentTime);
    this.currentTime = 0;
    this.currentSolver = solveSpring(
      this.currentPosition,
      curV,
      this.targetPosition,
      0,
      this.params
    );
    this.getV = getVelocity(this.currentSolver);
    this.getV2 = getVelocity(this.getV);
  }

  arrived() {
    return (
      Math.abs(this.targetPosition - this.currentPosition) < 0.01 &&
      Math.abs(this.getV(this.currentTime)) < 0.01 &&
      Math.abs(this.getV2(this.currentTime)) < 0.01 &&
      this.queueParams === undefined &&
      this.queuePosition === undefined
    );
  }

  setPosition(targetPosition) {
    this.targetPosition = targetPosition;
    this.currentPosition = targetPosition;
    this.currentSolver = () => this.targetPosition;
    this.getV = () => 0;
    this.getV2 = () => 0;
    this.queuePosition = undefined;
    this.queueParams = undefined;
  }

  updateParams(params, delaySecs = 0) {
    if (delaySecs > 0) {
      this.queueParams = {
        ...(this.queueParams ?? {}),
        ...params,
        time: delaySecs,
      };
    } else {
      this.queueParams = undefined;
      this.params = {
        ...this.params,
        ...params,
      };
      this.resetSolver();
    }
  }

  setTargetPosition(targetPosition, delaySecs = 0) {
    if (
      delaySecs <= 0 &&
      Math.abs(this.targetPosition - targetPosition) < 0.001
    ) {
      this.queuePosition = undefined;
      return;
    }

    if (delaySecs > 0) {
      this.queuePosition = {
        position: targetPosition,
        time: delaySecs,
      };
    } else {
      this.queuePosition = undefined;
      this.targetPosition = targetPosition;
      this.resetSolver();
    }
  }

  SetGoal(goal, immediate = false) {
    if (immediate) {
      this.setPosition(goal);
    } else {
      this.setTargetPosition(goal, 0);
    }
  }

  update(dtSecs = 0) {
    if (dtSecs <= 0) return this.currentPosition;
    this.currentTime += dtSecs;
    this.currentPosition = this.currentSolver(this.currentTime);

    if (this.queueParams) {
      this.queueParams.time -= dtSecs;
      if (this.queueParams.time <= 0) {
        const qp = { ...this.queueParams };
        this.queueParams = undefined;
        this.updateParams(qp, 0);
      }
    }

    if (this.queuePosition) {
      this.queuePosition.time -= dtSecs;
      if (this.queuePosition.time <= 0) {
        const target = this.queuePosition.position;
        this.queuePosition = undefined;
        this.setTargetPosition(target, 0);
      }
    }

    if (this.arrived()) {
      this.setPosition(this.targetPosition);
    }

    return this.currentPosition;
  }

  Step(dtSecs) {
    return this.update(dtSecs);
  }

  getCurrentPosition() {
    return this.currentPosition;
  }
}
