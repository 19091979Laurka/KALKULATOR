import React, { useEffect } from "react";

export default function PrintPreviewPage() {
  useEffect(() => {
    const html = localStorage.getItem("ksws_print_html");
    if (html) {
      document.open();
      document.write(html);
      document.close();
    } else {
      document.body.innerHTML = "<h2 style='padding:20px;font-family:sans-serif;'>Brak danych do wyświetlenia. Zamknij tę kartę i wygeneruj raport ponownie.</h2>";
    }
  }, []);

  return null;
}
