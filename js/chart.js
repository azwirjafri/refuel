const METRICS = {
  cost: { key: "cost", label: "Fuel spending", unit: "currency" },
  liters: { key: "liters", label: "Litres added", unit: "liters" },
  price: { key: "price", label: "Price per litre", unit: "currency" },
  visits: { key: "visits", label: "Refuel visits", unit: "number" },
  perDay: { key: "perDay", label: "Cost per day", unit: "currency" }
};

export class TrendChart {
  constructor(canvas, tooltip, fallback, formatters) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.tooltip = tooltip;
    this.fallback = fallback;
    this.formatters = formatters;
    this.points = [];
    this.data = [];
    this.metric = "cost";
    this.smoothed = false;
    this.animationFrame = null;
    this.hoverFrame = null;
    this.hasRendered = false;
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.resizeObserver = new ResizeObserver(() => this.draw(1));
    this.resizeObserver.observe(canvas.parentElement);
    canvas.addEventListener("pointermove", event => this.queueHover(event));
    canvas.addEventListener("pointerleave", () => this.hideTooltip());
  }

  setData(data, metric, smoothed = false) {
    this.hideTooltip();
    this.data = data;
    this.metric = metric;
    this.smoothed = smoothed;
    this.fallback.textContent = this.describe();
    const label = METRICS[metric].label;
    this.canvas.setAttribute("aria-label", `${label} by month${smoothed ? ", with a three-month rolling average" : ""}`);
    if (!this.hasRendered || this.reducedMotion) {
      this.draw(1);
      this.hasRendered = true;
      return;
    }
    this.animate();
  }

  animate() {
    cancelAnimationFrame(this.animationFrame);
    const start = performance.now();
    const duration = 320;
    const frame = now => {
      const raw = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - raw, 3);
      this.draw(eased);
      if (raw < 1) this.animationFrame = requestAnimationFrame(frame);
    };
    this.animationFrame = requestAnimationFrame(frame);
  }

  draw(progress = 1) {
    const { canvas, ctx } = this;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(bounds.width);
    const height = Math.round(bounds.height);
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const styles = getComputedStyle(document.documentElement);
    const colors = {
      ink: styles.getPropertyValue("--ink").trim(),
      muted: styles.getPropertyValue("--muted").trim(),
      line: styles.getPropertyValue("--line").trim(),
      green: styles.getPropertyValue("--green").trim(),
      greenDark: styles.getPropertyValue("--green").trim(),
      lime: styles.getPropertyValue("--coral").trim(),
      orange: styles.getPropertyValue("--coral").trim()
    };
    const pad = { top: 20, right: 14, bottom: 44, left: width < 520 ? 45 : 60 };
    const plotWidth = Math.max(1, width - pad.left - pad.right);
    const plotHeight = Math.max(1, height - pad.top - pad.bottom);
    const metric = METRICS[this.metric];
    const values = this.data.map(item => item[metric.key]);
    const smoothValues = this.smoothed ? this.data.map(item => item.smooth).filter(value => value !== null && value !== undefined) : [];
    const maxValue = niceMaximum(Math.max(...values, ...smoothValues, 0));

    ctx.font = "12px Inter, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 1;
    ctx.strokeStyle = colors.line;
    ctx.fillStyle = colors.muted;
    ctx.textAlign = "right";

    for (let i = 0; i <= 4; i += 1) {
      const y = pad.top + plotHeight * (i / 4);
      const value = maxValue * (1 - i / 4);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();
      ctx.fillText(this.axisFormat(value), pad.left - 9, y);
    }

    if (!this.data.length) {
      ctx.fillStyle = colors.muted;
      ctx.textAlign = "center";
      ctx.font = "14px Inter, system-ui, sans-serif";
      ctx.fillText("No records in this period", width / 2, height / 2);
      this.points = [];
      return;
    }

    const slot = plotWidth / this.data.length;
    const barWidth = Math.min(46, Math.max(7, slot * .54));
    this.points = [];
    this.data.forEach((item, index) => {
      const value = item[metric.key];
      const targetHeight = maxValue ? (value / maxValue) * plotHeight : 0;
      const barHeight = targetHeight * progress;
      const x = pad.left + slot * index + slot / 2;
      const y = pad.top + plotHeight - barHeight;
      if (!item.hasData) {
        this.points.push({ x, y: pad.top + plotHeight, width: Math.max(slot, barWidth), item, value: null, hasData: false });
        return;
      }
      const gradient = ctx.createLinearGradient(0, y, 0, pad.top + plotHeight);
      gradient.addColorStop(0, colors.green);
      gradient.addColorStop(1, colors.greenDark);
      ctx.fillStyle = gradient;
      roundRect(ctx, x - barWidth / 2, y, barWidth, Math.max(2, barHeight), Math.min(8, barWidth / 2));
      ctx.fill();
      this.points.push({ x, y, width: Math.max(slot, barWidth), item, value, hasData: true });
    });

    if (this.smoothed) this.drawAverageLine(colors, pad, plotWidth, plotHeight, maxValue, slot, progress);

    ctx.fillStyle = colors.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const labelEvery = Math.max(1, Math.ceil(this.data.length / (width < 520 ? 4 : 9)));
    let previousYear = null;
    this.data.forEach((item, index) => {
      const year = item.date.getFullYear();
      const yearChanged = year !== previousYear;
      previousYear = year;
      const show = index % labelEvery === 0 || index === this.data.length - 1 || yearChanged;
      if (!show) return;
      const x = pad.left + slot * index + slot / 2;
      ctx.fillText(yearChanged ? `${this.formatters.shortMonth(item.date)} ${year}` : this.formatters.shortMonth(item.date), x, height - pad.bottom + 14);
    });
  }

  drawAverageLine(colors, pad, plotWidth, plotHeight, maxValue, slot, progress) {
    const { ctx } = this;
    const points = this.data
      .map((item, index) => ({ item, x: pad.left + slot * index + slot / 2 }))
      .filter(({ item }) => item.smooth !== null && item.smooth !== undefined && item.hasData);

    if (points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = colors.orange || colors.greenDark;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    points.forEach(({ item, x }, index) => {
      const y = pad.top + plotHeight - (maxValue ? (item.smooth / maxValue) * plotHeight : 0) * progress;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }

  queueHover(event) {
    if (this.hoverFrame) return;
    this.hoverFrame = requestAnimationFrame(() => {
      this.hoverFrame = null;
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const nearest = this.points.reduce((best, point) => {
        const distance = Math.abs(point.x - x);
        return !best || distance < best.distance ? { point, distance } : best;
      }, null);
      if (!nearest || nearest.distance > nearest.point.width / 2) {
        this.hideTooltip();
        return;
      }
      this.showTooltip(nearest.point);
    });
  }

  showTooltip(point) {
    if (!point.hasData) {
      this.tooltip.replaceChildren();
      const strong = document.createElement("strong");
      strong.textContent = "No refuels";
      const span = document.createElement("span");
      span.textContent = this.formatters.longMonth(point.item.date);
      this.tooltip.append(strong, span);
    } else {
      const label = this.formatters.longMonth(point.item.date);
      const value = this.valueFormat(point.value);
      this.tooltip.replaceChildren();
      const strong = document.createElement("strong");
      strong.textContent = value;
      const span = document.createElement("span");
      const average = this.smoothed && point.item.smooth !== null && point.item.smooth !== undefined
        ? ` · avg ${this.valueFormat(point.item.smooth)}`
        : "";
      span.textContent = `${label} · ${point.item.visits} refuel${point.item.visits === 1 ? "" : "s"}${average}`;
      this.tooltip.append(strong, span);
    }
    this.tooltip.hidden = false;
    const containerWidth = this.canvas.getBoundingClientRect().width;
    const clampedX = Math.min(containerWidth - 82, Math.max(82, point.x));
    this.tooltip.style.left = `${clampedX}px`;
    this.tooltip.style.top = `${Math.max(52, point.y)}px`;
  }

  hideTooltip() {
    this.tooltip.hidden = true;
  }

  axisFormat(value) {
    if (this.metric === "cost" || this.metric === "perDay") return this.formatters.compactCurrency(value);
    if (this.metric === "price") return value.toFixed(2);
    return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : Math.round(value).toString();
  }

  valueFormat(value) {
    if (this.metric === "cost") return this.formatters.currency(value);
    if (this.metric === "perDay") return `${this.formatters.currency(value)} / day`;
    if (this.metric === "price") return `${this.formatters.currency(value)} / L`;
    return `${this.formatters.number(value, 1)} L`;
  }

  describe() {
    if (!this.data.length) return "No monthly chart data is available for the selected filters.";
    const metric = METRICS[this.metric];
    const withData = this.data.filter(item => item.hasData);
    if (!withData.length) return "No monthly chart data is available for the selected filters.";
    const peak = withData.reduce((best, item) => item[metric.key] > best[metric.key] ? item : best, withData[0]);
    const missing = this.data.length - withData.length;
    const gapNote = missing
      ? ` ${missing} of ${this.data.length} months have no refuel records and are shown as gaps.`
      : "";
    const months = `${this.data.length} month${this.data.length === 1 ? "" : "s"}`;
    return `${metric.label} across ${months}. The highest month is ${this.formatters.longMonth(peak.date)} at ${this.valueFormat(peak[metric.key])}.${gapNote}`;
  }
}

function niceMaximum(value) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
