document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("enter-btn").addEventListener("click", () => {
        document.getElementById("splash").classList.add("hidden");
        initVisualization();
    });
});

function initVisualization() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Create SVG
    const svg = d3.select("#plot1")
        .append("svg")
        .attr("viewBox", [0, 0, width, height]);

    // Groups
    const gGrid = svg.append("g");
    const gStars = svg.append("g");
    const gStarsBright = gStars.append("g").attr("class", "stars-bright");
    const gStarsMedium = gStars.append("g").attr("class", "stars-medium").attr("opacity", 0);
    const gStarsFaint  = gStars.append("g").attr("class", "stars-faint").attr("opacity", 0);
    const gx = svg.append("g").attr("class", "axis");
    const gy = svg.append("g").attr("class", "axis");

    // Scales
    const x = d3.scaleLinear().domain([0, 24]).range([0, width]);
    const y = d3.scaleLinear().domain([-90, 90]).range([height, 0]);

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
            mag: +d.mag
        })).filter(d =>
            Number.isFinite(d.ra) &&
            Number.isFinite(d.dec) &&
            Number.isFinite(d.mag)
        );

        const bright = data.filter(d => d.mag <= 5);
        const medium = data.filter(d => d.mag > 5 && d.mag <= 8);
        const faint = data.filter(d => d.mag > 8);

        const rScale = d3.scaleLinear()
            .domain([-1, 12])
            .range([1.5, 0.05])
            .clamp(true);

        // Draw stars
        gStarsBright.selectAll("circle")
            .data(bright)
            .join("circle")
            .attr("cx", d => x(d.ra))
            .attr("cy", d => y(d.dec))
            .attr("r", d => rScale(d.mag));

        gStarsMedium.selectAll("circle")
            .data(medium)
            .join("circle")
            .attr("cx", d => x(d.ra))
            .attr("cy", d => y(d.dec))
            .attr("r", d => rScale(d.mag));

        gStarsFaint.selectAll("circle")
            .data(faint)
            .join("circle")
            .attr("cx", d => x(d.ra))
            .attr("cy", d => y(d.dec))
            .attr("r", d => rScale(d.mag));

        // Zoom Behavior
        function zoomed({ transform }) {
            const zx = transform.rescaleX(x);
            const zy = transform.rescaleY(y);
            const k = transform.k;

            gStars.attr("transform", transform);

            gStarsBright.attr("opacity", 1);

            const mediumOpacity = Math.max(0, Math.min(0.8, (k - 1.5) / 2.5));
            const faintOpacity = Math.max(0, Math.min(0.7, (k - 3) / 4));

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

        // Reset button
        d3.select("body")
            .append("button")
            .attr("id", "reset-btn")
            .text("Reset zoom")
            .on("click", () => {
                svg.transition()
                    .duration(750)
                    .call(zoom.transform, d3.zoomIdentity);
            });

    }).catch(err => console.error(err));
}
