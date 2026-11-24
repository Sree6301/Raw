package com.smartxerox.admin.ui.screens.settings

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.smartxerox.admin.SmartXeroxApplication
import com.smartxerox.admin.data.model.PricingEntity
import com.smartxerox.admin.data.model.PrintJobOptions
import com.smartxerox.admin.hardware.SmartTankPrintAdapter
import com.smartxerox.admin.ui.theme.*
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileOutputStream

@Composable
fun SettingsScreen() {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val app = context.applicationContext as SmartXeroxApplication
    val pricingRepo = app.pricingRepository
    val pricingState by pricingRepo.pricing.collectAsState(initial = null)

    var a4BwSingle by remember { mutableStateOf("2.0") }
    var a4BwDouble by remember { mutableStateOf("3.0") }
    var a4ColorSingle by remember { mutableStateOf("10.0") }
    var a4ColorDouble by remember { mutableStateOf("18.0") }
    var photoA4 by remember { mutableStateOf("40.0") }
    var photo4x6 by remember { mutableStateOf("20.0") }
    var passport8 by remember { mutableStateOf("30.0") }
    var scanRate by remember { mutableStateOf("10.0") }

    LaunchedEffect(pricingState) {
        pricingState?.let {
            a4BwSingle = it.a4BwSingleSideRate.toString()
            a4BwDouble = it.a4BwDoubleSideRate.toString()
            a4ColorSingle = it.a4ColorSingleSideRate.toString()
            a4ColorDouble = it.a4ColorDoubleSideRate.toString()
            photoA4 = it.photoA4Rate.toString()
            photo4x6 = it.photo4x6Rate.toString()
            passport8 = it.passport8Rate.toString()
            scanRate = it.scanPerPageRate.toString()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkBackground)
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(
            text = "PRICING & HARDWARE SETTINGS",
            style = MaterialTheme.typography.titleMedium.copy(
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp
            ),
            color = TextSecondary
        )

        // Shop Rates Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = SurfaceCard),
            border = BorderStroke(1.dp, SurfaceCardBorder)
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Shop Rates (₹ INR)", fontWeight = FontWeight.Bold, color = TextPrimary)

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    RateField(label = "A4 B&W Single", value = a4BwSingle, onValueChange = { a4BwSingle = it }, modifier = Modifier.weight(1f))
                    RateField(label = "A4 B&W Double", value = a4BwDouble, onValueChange = { a4BwDouble = it }, modifier = Modifier.weight(1f))
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    RateField(label = "A4 Color Single", value = a4ColorSingle, onValueChange = { a4ColorSingle = it }, modifier = Modifier.weight(1f))
                    RateField(label = "A4 Color Double", value = a4ColorDouble, onValueChange = { a4ColorDouble = it }, modifier = Modifier.weight(1f))
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    RateField(label = "4×6 Photo Glossy", value = photo4x6, onValueChange = { photo4x6 = it }, modifier = Modifier.weight(1f))
                    RateField(label = "A4 Photo Glossy", value = photoA4, onValueChange = { photoA4 = it }, modifier = Modifier.weight(1f))
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    RateField(label = "Passport 8-Up Sheet", value = passport8, onValueChange = { passport8 = it }, modifier = Modifier.weight(1f))
                    RateField(label = "Scan Per Page", value = scanRate, onValueChange = { scanRate = it }, modifier = Modifier.weight(1f))
                }

                Spacer(modifier = Modifier.height(4.dp))

                Button(
                    onClick = {
                        coroutineScope.launch {
                            val newPricing = PricingEntity(
                                id = 1,
                                a4BwSingleSideRate = a4BwSingle.toDoubleOrNull() ?: 2.0,
                                a4BwDoubleSideRate = a4BwDouble.toDoubleOrNull() ?: 3.0,
                                a4ColorSingleSideRate = a4ColorSingle.toDoubleOrNull() ?: 10.0,
                                a4ColorDoubleSideRate = a4ColorDouble.toDoubleOrNull() ?: 18.0,
                                photoA4Rate = photoA4.toDoubleOrNull() ?: 40.0,
                                photo4x6Rate = photo4x6.toDoubleOrNull() ?: 20.0,
                                passport8Rate = passport8.toDoubleOrNull() ?: 30.0,
                                scanPerPageRate = scanRate.toDoubleOrNull() ?: 10.0
                            )
                            val res = pricingRepo.updatePricing(newPricing)
                            if (res.isSuccess) {
                                Toast.makeText(context, "Rates saved & synchronized with backend!", Toast.LENGTH_SHORT).show()
                            } else {
                                Toast.makeText(context, "Saved locally (backend offline)", Toast.LENGTH_SHORT).show()
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = BrandBlue)
                ) {
                    Icon(Icons.Default.Save, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Save Rates & Sync", fontWeight = FontWeight.Bold)
                }
            }
        }

        // HP Smart Tank 589 Hardware Status Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = SurfaceCard),
            border = BorderStroke(1.dp, SurfaceCardBorder)
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Printer Hardware Status", fontWeight = FontWeight.Bold, color = TextPrimary)
                Text("Model: HP Smart Tank 589 (USB OTG & Wi-Fi IPP)", color = TextSecondary, fontSize = 13.sp)

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Wi-Fi IPP Status", color = TextSecondary)
                    Text("Ready • Port 631", color = AccentEmerald, fontWeight = FontWeight.Bold)
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("USB OTG Status", color = TextSecondary)
                    Text("HP Vendor 0x03F0 (Active)", color = AccentCyan, fontWeight = FontWeight.Bold)
                }

                Spacer(modifier = Modifier.height(4.dp))

                OutlinedButton(
                    onClick = {
                        try {
                            val tempFile = File(context.cacheDir, "test_page.pdf")
                            val pdfDoc = android.graphics.pdf.PdfDocument()
                            val pageInfo = android.graphics.pdf.PdfDocument.PageInfo.Builder(595, 842, 1).create()
                            val page = pdfDoc.startPage(pageInfo)
                            val canvas = page.canvas
                            val p = android.graphics.Paint().apply {
                                color = android.graphics.Color.BLACK
                                textSize = 28f
                            }
                            canvas.drawText("Smart Xerox Hub - HP Smart Tank 589 Test Page", 50f, 100f, p)
                            pdfDoc.finishPage(page)
                            FileOutputStream(tempFile).use { out -> pdfDoc.writeTo(out) }
                            pdfDoc.close()

                            SmartTankPrintAdapter.launchPrint(
                                context,
                                tempFile,
                                "HP_589_Test_Print",
                                PrintJobOptions(paperSize = "A4", colorMode = "BW")
                            )
                        } catch (e: Exception) {
                            Toast.makeText(context, "Error launching test print: ${e.message}", Toast.LENGTH_SHORT).show()
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(Icons.Default.Print, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Print HP 589 Test Page")
                }
            }
        }
    }
}

@Composable
fun RateField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label, fontSize = 11.sp) },
        singleLine = true,
        modifier = modifier,
        colors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = TextPrimary,
            unfocusedTextColor = TextPrimary,
            focusedContainerColor = DarkBackground,
            unfocusedContainerColor = DarkBackground
        )
    )
}
