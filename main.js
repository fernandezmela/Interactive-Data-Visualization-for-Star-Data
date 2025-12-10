document.addEventListener("DOMContentLoaded", () => {
    const splash    = document.getElementById("splash");
    const enterBtn  = document.getElementById("enter-btn");

    const infoButton = document.getElementById("infoButton");
    const infoModal  = document.getElementById("infoModal");
    const closeInfo  = document.getElementById("closeInfo");

    // Enter visualization from splash screen
    if (enterBtn && splash) {
        enterBtn.addEventListener("click", () => {
            splash.classList.add("hidden");
            initVisualization();
        });
    } else {
        // Fallback: if splash/enter button aren't there, still show viz
        initVisualization();
    }

    // Open info modal when button clicked
    if (infoButton && infoModal) {
        infoButton.addEventListener("click", () => {
            infoModal.style.display = "flex"; // show modal (flex centers content)
        });
    }

    // Close modal when X is clicked
    if (closeInfo && infoModal) {
        closeInfo.addEventListener("click", () => {
            infoModal.style.display = "none";
        });
    }

    // Close modal when clicking on the dark overlay outside the box
    if (infoModal) {
        infoModal.addEventListener("click", (event) => {
            if (event.target === infoModal) {
                infoModal.style.display = "none";
            }
        });
    }
});

function initVisualization() {
    const width  = window.innerWidth;
    const height = window.innerHeight;

    // Create SVG
    const svg = d3.select("#plot1")
        .append("svg")
        .attr("viewBox", [0, 0, width, height]);

    // Groups
    const gGrid        = svg.append("g");
    const gStars       = svg.append("g");
    const gStarsBright = gStars.append("g").attr("class", "stars-bright");
    const gStarsMedium = gStars.append("g").attr("class", "stars-medium").attr("opacity", 0);
    const gStarsFaint  = gStars.append("g").attr("class", "stars-faint").attr("opacity", 0);
    const gx           = svg.append("g").attr("class", "axis");
    const gy           = svg.append("g").attr("class", "axis");

    // Scales for sky coordinates
    const x = d3.scaleLinear().domain([0, 24]).range([0, width]);    // RA in hours
    const y = d3.scaleLinear().domain([-90, 90]).range([height, 0]); // Dec in degrees

    // Axes
    const xAxis = (g, scaleX) =>
        g.attr("transform", `translate(0, ${height - 40})`)
            .call(d3.axisBottom(scaleX).ticks(12).tickFormat(d => `${d}h`));

    const yAxis = (g, scaleY) =>
        g.attr("transform", `translate(40, 0)`)
            .call(d3.axisLeft(scaleY).ticks(9).tickFormat(d => `${d}°`));

    // Load star data
    d3.csv("hyg_v42.csv").then(raw => {
        const data = raw.map(d => ({
            ra: +d.ra,
            dec: +d.dec,
            mag: +d.mag,
            proper: d.proper,                 // star's proper name
            spect: d.spect,                   // spectral type (O, B, A, F, G, K, M...)
            dist: d.dist ? +d.dist : null     // distance from the Sun (parsecs)
        })).filter(d =>
            Number.isFinite(d.ra) &&
            Number.isFinite(d.dec) &&
            Number.isFinite(d.mag)
        );

        // Randomly choose a subset of stars to have hover color behavior
        const total            = data.length;
        const targetHoverCount = 112000;               // adjust if you want more/less
        const hoverProb        = Math.min(1, targetHoverCount / total);

        data.forEach(d => {
            d.hoverEligible = Math.random() < hoverProb;
        });

        // Brightness categories
        const bright = data.filter(d => d.mag <= 5);
        const medium = data.filter(d => d.mag > 5 && d.mag <= 8);
        const faint  = data.filter(d => d.mag > 8);

        // Radius scale (smaller radius for fainter stars, but never 0)
        const rScale = d3.scaleLinear()
            .domain([-1, 12])
            .range([1.5, 0.05])
            .clamp(true);

        // Radial detail chart setup
        const detailSvg = d3.select("#radial-chrt");
        const starMeta  = d3.select("#star-meta");

        const hasDetail = !detailSvg.empty() && !starMeta.empty();

        let detailWidth = 0, detailHeight = 0, centerX = 0, centerY = 0;
        if (hasDetail) {
            detailWidth  = +detailSvg.attr("width");
            detailHeight = +detailSvg.attr("height");
            centerX      = detailWidth / 2;
            centerY      = detailHeight / 2;
        }

        // Only use distances that exist for scaling
        const maxDist = d3.max(data, d => (d.dist != null ? d.dist : 0)) || 1;

        // Scale for radial chart (distance from the Sun)
        const rDetail = d3.scaleSqrt()
            .domain([0, maxDist])
            .range([0, 90]); // max radius in the detail chart

        // Helper: temperature color from spectral type
        function getTemperatureColor(d) {
            const spect = (d.spect || "").trim();
            const t = spect.charAt(0).toUpperCase();

            // Simple 3-category mapping:
            // Hot (O, B, A) -> blue
            // Medium (F, G) -> orange
            // Cool (K, M) -> red
            if (["O", "B", "A"].includes(t)) return "#6bb6ff";  // blue
            if (["F", "G"].includes(t))      return "#ffb347";  // orange
            if (["K", "M"].includes(t))      return "#ff6b6b";  // red

            // Fallback
            return "#ffffff";
        }

        // Draw/refresh the radial chart for a clicked star
        function showStarDetail(d) {
            if (!hasDetail) return;

            const name = (d.proper && d.proper.trim())
                ? d.proper.trim()
                : "Unnamed star";

            detailSvg.selectAll("*").remove(); // clear previous drawing

            // Background rings for context
            const ringDistances = [maxDist * 0.25, maxDist * 0.5, maxDist * 0.75, maxDist];
            ringDistances.forEach(distVal => {
                detailSvg.append("circle")
                    .attr("cx", centerX)
                    .attr("cy", centerY)
                    .attr("r", rDetail(distVal))
                    .attr("fill", "none")
                    .attr("stroke", "#444")
                    .attr("stroke-width", 1)
                    .attr("opacity", 0.5);
            });

            // Mark the Sun at the center
            detailSvg.append("circle")
                .attr("cx", centerX)
                .attr("cy", centerY)
                .attr("r", 3)
                .attr("fill", "#ffff66");

            // Compute radius for this star
            const dist = d.dist != null ? d.dist : 0;
            const r    = rDetail(dist);

            // Radial line from Sun to star
            detailSvg.append("line")
                .attr("x1", centerX)
                .attr("y1", centerY)
                .attr("x2", centerX)
                .attr("y2", centerY - r)
                .attr("stroke", getTemperatureColor(d))
                .attr("stroke-width", 2);

            // Star marker at the end
            detailSvg.append("circle")
                .attr("cx", centerX)
                .attr("cy", centerY - r)
                .attr("r", 5)
                .attr("fill", getTemperatureColor(d));

            // Update text info
            starMeta.html(`
                <strong>${name}</strong><br>
                Distance: ${d.dist ? d.dist.toFixed(1) + " pc" : "unknown"}<br>
                Spectral type: ${d.spect || "unknown"}<br>
                RA: ${d.ra.toFixed(2)} h, Dec: ${d.dec.toFixed(2)}°
            `);
        }

        // Hover behavior for randomly selected stars
        function handleMouseOver(event, d) {
            if (!d.hoverEligible) return;
            d3.select(this)
                .attr("fill", getTemperatureColor(d));
        }

        function handleMouseOut(event, d) {
            if (!d.hoverEligible) return;
            d3.select(this)
                .attr("fill", null); // remove inline color → back to CSS
        }

        // Click behavior: show radial chart for ANY star
        function handleClick(event, d) {
            showStarDetail(d);
        }

        // Draw stars
        gStarsBright.selectAll("circle")
            .data(bright)
            .join("circle")
            .attr("cx", d => x(d.ra))
            .attr("cy", d => y(d.dec))
            .attr("r", d => rScale(d.mag))
            .on("mouseover", handleMouseOver)
            .on("mouseout", handleMouseOut)
            .on("click", handleClick);

        gStarsMedium.selectAll("circle")
            .data(medium)
            .join("circle")
            .attr("cx", d => x(d.ra))
            .attr("cy", d => y(d.dec))
            .attr("r", d => rScale(d.mag))
            .on("mouseover", handleMouseOver)
            .on("mouseout", handleMouseOut)
            .on("click", handleClick);

        gStarsFaint.selectAll("circle")
            .data(faint)
            .join("circle")
            .attr("cx", d => x(d.ra))
            .attr("cy", d => y(d.dec))
            .attr("r", d => rScale(d.mag))
            .on("mouseover", handleMouseOver)
            .on("mouseout", handleMouseOut)
            .on("click", handleClick);

        // Initial axes
        gx.call(xAxis, x);
        gy.call(yAxis, y);

        // Zoom behavior
        function zoomed({ transform }) {
            const zx = transform.rescaleX(x);
            const zy = transform.rescaleY(y);
            const k  = transform.k;

            gStars.attr("transform", transform);

            gStarsBright.attr("opacity", 1);

            const mediumOpacity = Math.max(0, Math.min(0.8, (k - 1.5) / 2.5));
            const faintOpacity  = Math.max(0, Math.min(0.7, (k - 3) / 4));

            gStarsMedium.attr("opacity", mediumOpacity);
            gStarsFaint.attr("opacity", faintOpacity);

            gx.call(xAxis, zx);
            gy.call(yAxis, zy);
        }

        const zoom = d3.zoom()
            .scaleExtent([1, 50])
            .translateExtent([[0, 0], [width, height]]) // limit how far you can pan
            .extent([[0, 0], [width, height]])          // zoom viewport
            .on("zoom", zoomed);

        svg.call(zoom)
            .call(zoom.transform, d3.zoomIdentity);

        // Reset zoom button
        d3.select("body")
            .append("button")
            .attr("id", "reset-btn")
            .text("Reset View")
            .style("position", "fixed")
            .style("bottom", "20px")
            .style("right", "20px")
            .style("padding", "10px 16px")
            .style("background", "#111827")
            .style("color", "white")
            .style("border-radius", "6px")
            .style("border", "1px solid #444")
            .style("cursor", "pointer")
            .style("z-index", "2000")
            .on("click", () => {
                svg.transition()
                    .duration(750)
                    .call(zoom.transform, d3.zoomIdentity);
            });

    }).catch(err => console.error(err));
}

