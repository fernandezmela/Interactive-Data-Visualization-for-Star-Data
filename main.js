// main.js

document.addEventListener("DOMContentLoaded", () => {
    const splash    = document.getElementById("splash");
    const enterBtn  = document.getElementById("enter-btn");

    const infoButton = document.getElementById("infoButton");
    const infoModal  = document.getElementById("infoModal");
    const closeInfo  = document.getElementById("closeInfo");

    window.addEventListener("resize", () => location.reload());

    // Enter visualization from splash screen (wait until fade completes)
    if (enterBtn && splash) {
        enterBtn.addEventListener("click", () => {
            splash.classList.add("hidden");

            // match CSS transition (0.6s) + tiny buffer
            setTimeout(() => {
                splash.style.display = "none";
                initVisualization();
            }, 650);
        });
    } else {
        initVisualization();
    }

    // Modal open/close
    if (infoButton && infoModal) {
        infoButton.addEventListener("click", () => {
            infoModal.style.display = "flex";
        });
    }

    if (closeInfo && infoModal) {
        closeInfo.addEventListener("click", () => {
            infoModal.style.display = "none";
        });
    }

    if (infoModal) {
        infoModal.addEventListener("click", (event) => {
            if (event.target === infoModal) infoModal.style.display = "none";
        });
    }
});

function initVisualization() {
    const width  = window.innerWidth;
    const height = window.innerHeight;

    const starPanel = d3.select("#star-hover-panel");
    const savedList = d3.select("#saved-stars-list");

    const axisPadding = 40;
    const axisBgOpacity = 0.85;

    // Create SVG
    const svg = d3.select("#plot1")
        .append("svg")
        .attr("id", "star-svg")
        .attr("viewBox", `0 0 ${width} ${height}`);

    // Axes housekeeping
    // defs: clip paths to prevent tiny overlap at the corner of axes
    const defs = svg.append("defs");

    // X-axis strip (bottom): only allow drawing from x = axisPadding to the right
    defs.append("clipPath")
        .attr("id", "clip-x-axis")
        .append("rect")
        .attr("x", axisPadding)
        .attr("y", height - axisPadding)
        .attr("width", width - axisPadding)
        .attr("height", axisPadding);

    // Y-axis strip (left): only allow drawing from y = 0 down to y = height - axisPadding
    defs.append("clipPath")
        .attr("id", "clip-y-axis")
        .append("rect")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", axisPadding)
        .attr("height", height - axisPadding);

    // Corner clip
    defs.append("clipPath")
        .attr("id", "clip-corner")
        .append("rect")
        .attr("x", 0)
        .attr("y", height - axisPadding)
        .attr("width", axisPadding)
        .attr("height", axisPadding);

    // Stars group (with zoom)
    const gStars = svg.append("g");

    const gStarsFaint  = gStars.append("g").attr("class", "stars-faint").attr("opacity", 0);
    const gStarsMedium = gStars.append("g").attr("class", "stars-medium").attr("opacity", 0);
    const gStarsBright = gStars.append("g").attr("class", "stars-bright");

    // UI layer (not zoomed) for axes background
    const gUI = svg.append("g").attr("class", "ui-layer");

    // Axis background rectangles (on top of stars, behind axes)
    const gAxisBG = gUI.append("g").attr("class", "axis-bg");

    // Left strip (behind y-axis)
    gAxisBG.append("rect")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", axisPadding)
        .attr("height", height)
        .attr("fill", "black")
        .attr("opacity", axisBgOpacity);

    // Bottom strip (behind x-axis)
    gAxisBG.append("rect")
        .attr("x", 0)
        .attr("y", height - axisPadding)
        .attr("width", width)
        .attr("height", axisPadding)
        .attr("fill", "black")
        .attr("opacity", axisBgOpacity);

    // Corner square so strips blend nicely
    gAxisBG.append("rect")
        .attr("x", 0)
        .attr("y", height - axisPadding)
        .attr("width", axisPadding)
        .attr("height", axisPadding)
        .attr("fill", "black")
        .attr("opacity", axisBgOpacity);

    // Axes groups (pinned, not zoomed)
    const gx = gUI.append("g").attr("class", "axis");
    const gy = gUI.append("g").attr("class", "axis");

    // Scales
    const x = d3.scaleLinear().domain([0, 24]).range([axisPadding, width]);
    const y = d3.scaleLinear().domain([-90, 90]).range([height - axisPadding, 0]);

    // Axes
    const xAxis = (g, scaleX) =>
        g.attr("transform", `translate(0, ${height - axisPadding})`)
            .call(d3.axisBottom(scaleX)
                .ticks(12)
                .tickFormat(d => `${d}h`)
                .tickSizeOuter(0));

    const yAxis = (g, scaleY) =>
        g.attr("transform", `translate(${axisPadding}, 0)`)
            .call(d3.axisLeft(scaleY)
                .ticks(9)
                .tickFormat(d => `${d}°`)
                .tickSizeOuter(0));

    d3.csv("hyg_v42.csv").then(raw => {
        const data = raw.map((d, i) => ({
            _key: (d.id && d.id !== "") ? `id:${d.id}` : `row:${i}`,
            ra: +d.ra,
            dec: +d.dec,
            mag: +d.mag,
            proper: d.proper,
            spect: d.spect,
            dist: d.dist ? +d.dist : null,
            ci: d.ci !== "" && d.ci != null ? +d.ci : null
        })).filter(d =>
            Number.isFinite(d.ra) &&
            Number.isFinite(d.dec) &&
            Number.isFinite(d.mag)
        );

        const bright = data.filter(d => d.mag <= 5);
        const medium = data.filter(d => d.mag > 5 && d.mag <= 8);
        const faint  = data.filter(d => d.mag > 8);

        const rScale = d3.scaleLinear()
            .domain([-1, 12])
            .range([1.5, 0.05])
            .clamp(true);

        // B–V scale (blue → red)
        const ciColorScale = d3.scaleLinear()
            .domain([-0.3, 1.7])
            .range(["#6bb6ff", "#ff6b6b"])
            .clamp(true);

        // Distance chart scale (log)
        const distValues = data
            .filter(d => Number.isFinite(d.dist) && d.dist > 0)
            .map(d => d.dist);

        let maxDist = d3.max(distValues) || 1;
        const minDist = d3.min(distValues) || 0.1;
        maxDist = Math.min(maxDist, 500);

        const rDetail = d3.scaleLog()
            .domain([minDist, maxDist])
            .range([6, 110])
            .clamp(true);

        // Saved stars state:
        const saved = new Map(); // key -> { d, color, label }
        const MAX_SAVED = 10;

        let unnamedCounter = 1;

        function getDisplayName(d, savedEntry = null) {
            if (savedEntry && savedEntry.label) {
                return savedEntry.label;
            }

            const rawName = d.proper && d.proper.trim();
            return rawName ? rawName : "Unnamed Star";
        }

        function getHoverColor(d) {
            return Number.isFinite(d.ci) ? ciColorScale(d.ci) : "#ffffff";
        }

        // Panels
        function renderEmptyStarPanel() {
            starPanel.html(`
                <div class="star-header">Hover over a bright star to see its info</div>

                <div class="star-position">
                    Equatorial Position: RA , Dec
                </div>

                <div class="star-ci-section">
                    <div class="star-ci-title">B–V color index:</div>
                    <div class="ci-legend">
                        <div class="ci-gradient"></div>
                        <div class="ci-labels">
                            <span>-0.3 (blue)</span>
                            <span>1.7 (red)</span>
                        </div>
                    </div>
                </div>

                <div class="distance-chart">
                    <div class="distance-title">Distance from Earth (parsecs):</div>
                    <svg id="distance-chart-svg" width="250" height="250"></svg>
                    <div class="distance-caption">1 parsec ≈ 3.26 light-years ≈ 30.9 trillion kilometers (19.2 trillion miles)</div>
                </div>
            `);

            renderDistanceChart(null);
        }

        function renderDistanceChart(d) {
            const s = d3.select("#distance-chart-svg");
            if (s.empty()) return;

            const w  = +s.attr("width");
            const h  = +s.attr("height");
            const cx = w / 2;
            const cy = h / 2;

            s.selectAll("*").remove();

            // Base rings
            let ringDistances = [10, 25, 50, 100, 200, 500]
                .filter(val => val >= minDist && val <= maxDist);

            ringDistances.forEach(distVal => {
                const r = rDetail(distVal);

                s.append("circle")
                    .attr("cx", cx).attr("cy", cy).attr("r", r)
                    .attr("fill", "none")
                    .attr("stroke", "#444")
                    .attr("stroke-width", 1)
                    .attr("opacity", 0.6);

                s.append("text")
                    .attr("x", cx)
                    .attr("y", cy + r + 6)
                    .attr("text-anchor", "middle")
                    .attr("dominant-baseline", "hanging")
                    .attr("class", "distance-label")
                    .text(distVal.toFixed(0) + " pc");
            });

            // Earth
            s.append("circle")
                .attr("cx", cx).attr("cy", cy)
                .attr("r", 4)
                .attr("fill", "#7fd3ff");

            s.append("text")
                .attr("x", cx)
                .attr("y", cy + 16)
                .attr("text-anchor", "middle")
                .attr("fill", "#bbbbbb")
                .attr("font-size", 10)
                .text("Earth");

            if (!d) return;

            if (!Number.isFinite(d.dist) || d.dist <= 0) {
                s.append("text")
                    .attr("x", cx)
                    .attr("y", cy - 12)
                    .attr("text-anchor", "middle")
                    .attr("fill", "#cccccc")
                    .attr("font-size", 11)
                    .text("Distance unknown");
                return;
            }

            const rStar = rDetail(d.dist);
            const starColor = getHoverColor(d);

            s.append("line")
                .attr("x1", cx).attr("y1", cy)
                .attr("x2", cx).attr("y2", cy - rStar)
                .attr("stroke", starColor)
                .attr("stroke-width", 2)
                .attr("opacity", 0.9);

            s.append("circle")
                .attr("cx", cx)
                .attr("cy", cy - rStar)
                .attr("r", 4)
                .attr("fill", starColor);

            s.append("text")
                .attr("x", cx)
                .attr("y", cy - rStar - 8)
                .attr("text-anchor", "middle")
                .attr("fill", "#dddddd")
                .attr("font-size", 10)
                .text(d.dist.toFixed(1) + " pc");
        }

        function renderStarPanelFor(d) {
            const savedEntry = saved.get(d._key);
            const nameLabel = savedEntry
                ? savedEntry.label
                : getDisplayName(d);
            const ciText = Number.isFinite(d.ci) ? d.ci.toFixed(2) : "";
            const raStr  = d.ra.toFixed(2) + " h";
            const decStr = d.dec.toFixed(2) + "°";

            starPanel.html(`
                <div class="star-header">Proper Name: ${nameLabel}</div>

                <div class="star-position">
                    Equatorial Position: RA ${raStr}, Dec ${decStr}
                </div>

                <div class="star-ci-section">
                    <div class="star-ci-title">B–V color index: ${ciText}</div>
                    <div class="ci-legend">
                        <div class="ci-gradient"></div>
                        <div class="ci-labels">
                            <span>-0.3 (blue)</span>
                            <span>1.7 (red)</span>
                        </div>
                    </div>
                </div>

                <div class="distance-chart">
                    <div class="distance-title">Distance from Earth (parsecs):</div>
                    <svg id="distance-chart-svg" width="250" height="250"></svg>
                    <div class="distance-caption">1 parsec ≈ 3.26 light-years ≈ 30.9 trillion kilometers (19.2 trillion miles)</div>
                </div>
            `);

            renderDistanceChart(d);
        }

        function renderSavedPanel() {
            savedList.selectAll("*").remove();

            if (saved.size === 0) {
                savedList.append("div")
                    .attr("class", "saved-empty")
                    .text(
                        "You don't have any saved stars. Click on a bright star to add it to your collection. You can save up to 10 stars to return to later!"
                    );
                return;
            }

            const items = Array.from(saved.values());

            const row = savedList.selectAll(".saved-item")
                .data(items, s => s.d._key)
                .join("div")
                .attr("class", "saved-item")
                .on("click", (event, s) => {
                    focusStar(s.d);
                    renderStarPanelFor(s.d);
                });

            // Color swatch
            row.append("div")
                .attr("class", "saved-swatch")
                .style("background", s => s.color);

            // Star name
            row.append("div")
                .attr("class", "saved-name")
                .text(s => s.label);

            // Remove button
            row.append("button")
                .attr("class", "saved-remove")
                .html("&times;")
                .on("click", (event, s) => {
                    event.stopPropagation(); // IMPORTANT: don’t trigger row click

                    // Remove from saved map
                    saved.delete(s.d._key);

                    // Reset star appearance in visualization
                    gStarsBright.selectAll("circle")
                        .filter(d => d._key === s.d._key)
                        .attr("fill", "#ffffff")
                        .attr("r", d => rScale(d.mag));

                    renderSavedPanel();
                    renderEmptyStarPanel();
                });
        }

        // Stars drawing
        const brightSel = gStarsBright.selectAll("circle")
            .data(bright, d => d._key)
            .join("circle")
            .attr("cx", d => x(d.ra))
            .attr("cy", d => y(d.dec))
            .attr("r", d => rScale(d.mag))
            .attr("fill", "#ffffff");

        gStarsMedium.selectAll("circle")
            .data(medium, d => d._key)
            .join("circle")
            .attr("cx", d => x(d.ra))
            .attr("cy", d => y(d.dec))
            .attr("r", d => rScale(d.mag))
            .attr("fill", "#ffffff");

        gStarsFaint.selectAll("circle")
            .data(faint, d => d._key)
            .join("circle")
            .attr("cx", d => x(d.ra))
            .attr("cy", d => y(d.dec))
            .attr("r", d => rScale(d.mag))
            .attr("fill", "#ffffff");

        // Hover + Click behaviors (bright only)
        function onBrightOver(event, d) {
            renderStarPanelFor(d);

            const hoverColor = getHoverColor(d);
            const isSaved = saved.has(d._key);

            d3.select(event.currentTarget)
                .attr("fill", isSaved ? saved.get(d._key).color : hoverColor)
                .attr("r", rScale(d.mag) * 1.6);
        }

        function onBrightOut(event, d) {
            const isSaved = saved.has(d._key);

            d3.select(event.currentTarget)
                .attr("fill", isSaved ? saved.get(d._key).color : "#ffffff")
                .attr("r", rScale(d.mag));

            if (!isSaved) renderEmptyStarPanel();
        }

        function onBrightClick(event, d) {
            event.stopPropagation();

            if (saved.has(d._key)) {
                focusStar(d);
                renderStarPanelFor(d);
                return;
            }

            if (saved.size >= MAX_SAVED) {
                alert("You can only save up to 10 stars.");
                return;
            }

            const color = getHoverColor(d);

            const rawName = d.proper && d.proper.trim();
            const label = rawName
                ? rawName
                : `Unnamed Star ${unnamedCounter++}`;

            saved.set(d._key, { d, color, label });

            d3.select(event.currentTarget).attr("fill", color);

            renderSavedPanel();
            focusStar(d);
            renderStarPanelFor(d);
        }

        brightSel
            .on("mouseover", onBrightOver)
            .on("mouseout", onBrightOut)
            .on("click", onBrightClick);

        // Axes init
        gx.call(xAxis, x);
        gy.call(yAxis, y);

        // Zoom
        function zoomed({ transform }) {
            const zx = transform.rescaleX(x);
            const zy = transform.rescaleY(y);
            const k  = transform.k;

            gStars.attr("transform", transform);

            gStarsBright.attr("opacity", 1);

            const mediumOpacity = Math.max(0, Math.min(0.6, (k - 1.5) / 2.5));
            const faintOpacity  = Math.max(0, Math.min(0.5, (k - 3) / 4));

            gStarsMedium.attr("opacity", mediumOpacity);
            gStarsFaint.attr("opacity", faintOpacity);

            gx.call(xAxis, zx);
            gy.call(yAxis, zy);
        }

        const zoom = d3.zoom()
            .scaleExtent([1, 50])
            .translateExtent([[-width * 50, -height * 50], [width * 50, height * 50]])
            .extent([[0, 0], [width, height]])
            .on("zoom", zoomed);

        svg.call(zoom);

        let baseTransform = d3.zoomIdentity;

        function fitStarsToViewport() {
            const bbox = gStars.node().getBBox();

            const scaleX = width  / bbox.width;
            const scaleY = height / bbox.height;

            const fitScale = Math.min(scaleX, scaleY) * 1.02;

            const tx = (width  - fitScale * (bbox.x + bbox.width))  / 2;
            const ty = (height - fitScale * (bbox.y + bbox.height)) / 2;

            baseTransform = d3.zoomIdentity.translate(tx, ty).scale(fitScale);

            zoom.scaleExtent([fitScale, 50]);
            svg.call(zoom.transform, baseTransform);
        }

        function focusStar(d) {
            const targetK = 50;
            const tx = width / 2 - targetK * x(d.ra);
            const ty = height / 2 - targetK * y(d.dec);
            const t  = d3.zoomIdentity.translate(tx, ty).scale(targetK);

            svg.transition()
                .duration(900)
                .call(zoom.transform, t);
        }

        fitStarsToViewport();

        // Reset button
        d3.select("body")
            .append("button")
            .attr("id", "reset-btn")
            .text("Reset zoom")
            .on("click", () => {
                svg.transition()
                    .duration(750)
                    .call(zoom.transform, baseTransform);
            });

        // Initial UI content
        renderEmptyStarPanel();
        renderSavedPanel();

        // Show all ui at once (after viz is ready)
        document.getElementById("reset-btn").style.display = "block";
        document.getElementById("star-hover-panel").style.display = "block";
        document.getElementById("saved-stars-panel").style.display = "block";

    }).catch(err => console.error(err));
}
