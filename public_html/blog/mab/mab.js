document.addEventListener("DOMContentLoaded", function () {
  const ctx = document.getElementById("myChart").getContext("2d");
  const config = {
    type: "line", // Specify the type of chart
    data: {
      labels: ["January", "February", "March", "April", "May", "June", "July"], // X-axis labels
      datasets: [
        {
          label: "Right Decisions",
          data: [60, 70, 80, 90, 85, 75, 95], // Y-axis data for Right Decisions
          backgroundColor: "rgba(75, 192, 192, 0.5)",
          borderColor: "rgba(75, 192, 192, 1)",
          fill: true,
        },
        {
          label: "Wrong Decisions",
          data: [40, 30, 20, 10, 15, 25, 5], // Y-axis data for Wrong Decisions
          backgroundColor: "rgba(255, 99, 132, 0.5)",
          borderColor: "rgba(255, 99, 132, 1)",
          fill: true,
        },
      ],
    },
    options: {
      plugins: {
        tooltip: {
          mode: "index",
          intersect: false,
        },
      },
      scales: {
        x: {
          stacked: true,
        },
        y: {
          stacked: true,
          beginAtZero: true,
          max: 100, // Ensure the y-axis goes from 0 to 100
        },
      },
    },
  };

  // Create a new Chart instance
  const chart = new Chart(ctx, config);

  const worker = new Worker("worker.js");

  worker.postMessage("start");

  worker.addEventListener("message", function (e) {
    const data = e.data;
    console.log("Received data from worker:", data);

    // You can now use the data received from the worker
    if (data.rightDecisions !== undefined) {
      console.log("Right Decisions:", data.rightDecisions);
    }

    chart.data.datasets[0].data = newRightDecisionsData;
    chart.data.datasets[1].data = newWrongDecisionsData;
  });
});
