export default function handler(req, res) {
  if (req.method === "POST") {
    return res.status(200).json({
      success: true,
      message: "Data diterima"
    })
  }

  res.status(200).json({
    message: "API hidup"
  })
}
