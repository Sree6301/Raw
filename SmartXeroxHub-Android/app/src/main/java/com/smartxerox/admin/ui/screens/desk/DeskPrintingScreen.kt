package com.smartxerox.admin.ui.screens.desk

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.smartxerox.admin.data.model.PrintJobOptions
import com.smartxerox.admin.hardware.Passport8SheetGenerator
import com.smartxerox.admin.hardware.SmartTankPrintAdapter
import com.smartxerox.admin.ui.components.NumberStepper
import com.smartxerox.admin.ui.theme.*
import java.io.File
import java.io.FileOutputStream

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeskPrintingScreen() {
    val context = LocalContext.current
    var selectedTab by remember { mutableStateOf(0) }
    val tabTitles = listOf("📄 Document", "🖼️ Photo Studio", "👤 Passport 8-Up")

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkBackground)
            .padding(16.dp)
    ) {
        TabRow(
            selectedTabIndex = selectedTab,
            containerColor = SurfaceCard,
            contentColor = BrandBlue,
            divider = {}
        ) {
            tabTitles.forEachIndexed { index, title ->
                Tab(
                    selected = selectedTab == index,
                    onClick = { selectedTab = index },
                    text = {
                        Text(
                            text = title,
                            fontSize = 13.sp,
                            fontWeight = if (selectedTab == index) FontWeight.Bold else FontWeight.Normal,
                            color = if (selectedTab == index) BrandBlue else TextSecondary
                        )
                    }
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        when (selectedTab) {
            0 -> DeskDocumentView()
            1 -> DeskPhotoView()
            2 -> DeskPassport8View()
        }
    }
}

@Composable
fun DeskDocumentView() {
    val context = LocalContext.current
    var selectedFileUri by remember { mutableStateOf<Uri?>(null) }
    var selectedFileName by remember { mutableStateOf<String?>(null) }
    var copies by remember { mutableStateOf(1) }
    var colorMode by remember { mutableStateOf("BW") }
    var sides by remember { mutableStateOf("SINGLE") }
    var pagesPerSheet by remember { mutableStateOf(1) }

    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            selectedFileUri = uri
            selectedFileName = uri.lastPathSegment ?: "document.pdf"
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // File selection Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = SurfaceCard),
            border = BorderStroke(1.dp, SurfaceCardBorder)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Select PDF Document", fontWeight = FontWeight.Bold, color = TextPrimary)
                Spacer(modifier = Modifier.height(8.dp))
                if (selectedFileName != null) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.PictureAsPdf, contentDescription = null, tint = AccentCyan)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(selectedFileName!!, color = TextPrimary, modifier = Modifier.weight(1f), maxLines = 1)
                        IconButton(onClick = { selectedFileUri = null; selectedFileName = null }) {
                            Icon(Icons.Default.Close, contentDescription = null, tint = AccentRose)
                        }
                    }
                } else {
                    OutlinedButton(
                        onClick = { filePickerLauncher.launch("application/pdf") },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Icon(Icons.Default.UploadFile, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Browse PDF File")
                    }
                }
            }
        }

        // Settings
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = SurfaceCard),
            border = BorderStroke(1.dp, SurfaceCardBorder)
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text("Print Settings", fontWeight = FontWeight.Bold, color = TextPrimary)

                NumberStepper(
                    value = copies,
                    onValueChange = { copies = it },
                    min = 1,
                    max = 10,
                    label = "Number of Copies"
                )

                // Color Mode
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Color Mode", style = MaterialTheme.typography.bodyMedium, color = TextSecondary, modifier = Modifier.weight(1f))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(
                            selected = colorMode == "BW",
                            onClick = { colorMode = "BW" },
                            label = { Text("B&W (₹2)") }
                        )
                        FilterChip(
                            selected = colorMode == "COLOR",
                            onClick = { colorMode = "COLOR" },
                            label = { Text("Color (₹10)") }
                        )
                    }
                }

                // Sides Mode
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Sides", style = MaterialTheme.typography.bodyMedium, color = TextSecondary, modifier = Modifier.weight(1f))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(
                            selected = sides == "SINGLE",
                            onClick = { sides = "SINGLE" },
                            label = { Text("Single") }
                        )
                        FilterChip(
                            selected = sides == "MANUAL_DUPLEX",
                            onClick = { sides = "MANUAL_DUPLEX" },
                            label = { Text("Double Sided") }
                        )
                    }
                }

                // Pages Per Sheet
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Pages / Sheet", style = MaterialTheme.typography.bodyMedium, color = TextSecondary, modifier = Modifier.weight(1f))
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        listOf(1, 2, 4, 6).forEach { n ->
                            FilterChip(
                                selected = pagesPerSheet == n,
                                onClick = { pagesPerSheet = n },
                                label = { Text("$n") }
                            )
                        }
                    }
                }
            }
        }

        // Print Button
        Button(
            onClick = {
                if (selectedFileUri == null) {
                    Toast.makeText(context, "Please select a PDF document first", Toast.LENGTH_SHORT).show()
                    return@Button
                }
                try {
                    val input = context.contentResolver.openInputStream(selectedFileUri!!)
                    val tempFile = File(context.cacheDir, "desk_print.pdf")
                    FileOutputStream(tempFile).use { out -> input?.copyTo(out) }
                    val opts = PrintJobOptions(
                        colorMode = colorMode,
                        pagesPerSheet = pagesPerSheet,
                        paperSize = "A4",
                        paperType = "NORMAL_A4"
                    )
                    SmartTankPrintAdapter.launchPrint(context, tempFile, "Desk_Doc_Print", opts)
                } catch (e: Exception) {
                    Toast.makeText(context, "Error printing: ${e.message}", Toast.LENGTH_LONG).show()
                }
            },
            modifier = Modifier.fillMaxWidth().height(50.dp),
            shape = RoundedCornerShape(10.dp),
            colors = ButtonDefaults.buttonColors(containerColor = BrandBlue)
        ) {
            Icon(Icons.Default.Print, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Print Document to HP Smart Tank 589", fontWeight = FontWeight.Bold, fontSize = 15.sp)
        }
    }
}

@Composable
fun DeskPhotoView() {
    val context = LocalContext.current
    var selectedBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var paperSize by remember { mutableStateOf("PHOTO_4X6") }
    var isBorderless by remember { mutableStateOf(true) }
    var orientation by remember { mutableStateOf("PORTRAIT") }
    var copies by remember { mutableStateOf(1) }

    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            val stream = context.contentResolver.openInputStream(uri)
            selectedBitmap = BitmapFactory.decodeStream(stream)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Upload & Live Preview Canvas
        Card(
            modifier = Modifier.fillMaxWidth().height(300.dp),
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = SurfaceCard),
            border = BorderStroke(1.dp, SurfaceCardBorder)
        ) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                if (selectedBitmap != null) {
                    Image(
                        bitmap = selectedBitmap!!.asImageBitmap(),
                        contentDescription = "Selected Photo",
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(if (isBorderless) 0.dp else 16.dp)
                    )
                } else {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Default.AddPhotoAlternate, contentDescription = null, tint = AccentCyan, modifier = Modifier.size(48.dp))
                        Spacer(modifier = Modifier.height(12.dp))
                        OutlinedButton(
                            onClick = { photoPickerLauncher.launch("image/*") },
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text("Select Photo (JPG / PNG)")
                        }
                    }
                }
            }
        }

        // Settings
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = SurfaceCard),
            border = BorderStroke(1.dp, SurfaceCardBorder)
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text("Photo Print Setup", fontWeight = FontWeight.Bold, color = TextPrimary)

                NumberStepper(
                    value = copies,
                    onValueChange = { copies = it },
                    min = 1,
                    max = 10,
                    label = "Copies"
                )

                // Media Size
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Media Size", style = MaterialTheme.typography.bodyMedium, color = TextSecondary, modifier = Modifier.weight(1f))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(
                            selected = paperSize == "PHOTO_4X6",
                            onClick = { paperSize = "PHOTO_4X6" },
                            label = { Text("4×6 Index (₹20)") }
                        )
                        FilterChip(
                            selected = paperSize == "PHOTO_A4",
                            onClick = { paperSize = "PHOTO_A4" },
                            label = { Text("A4 Glossy (₹40)") }
                        )
                    }
                }

                // Border vs Borderless
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Layout", style = MaterialTheme.typography.bodyMedium, color = TextSecondary, modifier = Modifier.weight(1f))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(
                            selected = isBorderless,
                            onClick = { isBorderless = true },
                            label = { Text("Borderless") }
                        )
                        FilterChip(
                            selected = !isBorderless,
                            onClick = { isBorderless = false },
                            label = { Text("With Border") }
                        )
                    }
                }

                // Orientation
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Orientation", style = MaterialTheme.typography.bodyMedium, color = TextSecondary, modifier = Modifier.weight(1f))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(
                            selected = orientation == "PORTRAIT",
                            onClick = { orientation = "PORTRAIT" },
                            label = { Text("Portrait") }
                        )
                        FilterChip(
                            selected = orientation == "LANDSCAPE",
                            onClick = { orientation = "LANDSCAPE" },
                            label = { Text("Landscape") }
                        )
                    }
                }
            }
        }

        // Print Button
        Button(
            onClick = {
                if (selectedBitmap == null) {
                    Toast.makeText(context, "Please select an image first", Toast.LENGTH_SHORT).show()
                    return@Button
                }
                try {
                    val tempFile = File(context.cacheDir, "desk_photo.jpg")
                    FileOutputStream(tempFile).use { out ->
                        selectedBitmap!!.compress(Bitmap.CompressFormat.JPEG, 95, out)
                    }
                    val opts = PrintJobOptions(
                        colorMode = "COLOR",
                        paperSize = if (paperSize == "PHOTO_4X6") "4X6" else "A4",
                        paperType = paperSize,
                        orientation = orientation,
                        enableBorder = !isBorderless
                    )
                    SmartTankPrintAdapter.launchPrint(context, tempFile, "Desk_Photo_Print", opts)
                } catch (e: Exception) {
                    Toast.makeText(context, "Error printing photo: ${e.message}", Toast.LENGTH_LONG).show()
                }
            },
            modifier = Modifier.fillMaxWidth().height(50.dp),
            shape = RoundedCornerShape(10.dp),
            colors = ButtonDefaults.buttonColors(containerColor = BrandBlue)
        ) {
            Icon(Icons.Default.Print, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Print Photo to HP Smart Tank 589", fontWeight = FontWeight.Bold, fontSize = 15.sp)
        }
    }
}

@Composable
fun DeskPassport8View() {
    val context = LocalContext.current
    var sourceBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var passportSheetBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var copies by remember { mutableStateOf(1) }

    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            val stream = context.contentResolver.openInputStream(uri)
            val bmp = BitmapFactory.decodeStream(stream)
            if (bmp != null) {
                sourceBitmap = bmp
                // Generate verified 8-up composite
                passportSheetBitmap = Passport8SheetGenerator.buildPassport8UpBitmap(bmp)
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Calibration Info Banner
        Surface(
            color = AccentCyan.copy(alpha = 0.12f),
            shape = RoundedCornerShape(10.dp),
            border = BorderStroke(1.dp, AccentCyan.copy(alpha = 0.3f)),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Verified, contentDescription = null, tint = AccentCyan, modifier = Modifier.size(22.dp))
                Spacer(modifier = Modifier.width(10.dp))
                Column {
                    Text("Permanent Calibrated 8-Up Matrix", fontWeight = FontWeight.Bold, color = TextPrimary, fontSize = 13.sp)
                    Text("1800×1200 px at 300 DPI • 397×513 px photo • Fine cutting outline", color = TextSecondary, fontSize = 11.sp)
                }
            }
        }

        // Composite Sheet Preview
        Card(
            modifier = Modifier.fillMaxWidth().height(260.dp),
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = SurfaceCard),
            border = BorderStroke(1.dp, SurfaceCardBorder)
        ) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                if (passportSheetBitmap != null) {
                    Image(
                        bitmap = passportSheetBitmap!!.asImageBitmap(),
                        contentDescription = "8-Up Passport Sheet",
                        modifier = Modifier.fillMaxSize().padding(12.dp)
                    )
                } else {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Default.AccountBox, contentDescription = null, tint = AccentCyan, modifier = Modifier.size(48.dp))
                        Spacer(modifier = Modifier.height(12.dp))
                        OutlinedButton(
                            onClick = { photoPickerLauncher.launch("image/*") },
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text("Select Customer Photo")
                        }
                    }
                }
            }
        }

        if (sourceBitmap != null) {
            OutlinedButton(
                onClick = { photoPickerLauncher.launch("image/*") },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(8.dp)
            ) {
                Icon(Icons.Default.Edit, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Change Photo")
            }
        }

        // Copies setup
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = SurfaceCard),
            border = BorderStroke(1.dp, SurfaceCardBorder)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                NumberStepper(
                    value = copies,
                    onValueChange = { copies = it },
                    min = 1,
                    max = 10,
                    label = "Sheets (8 photos / sheet @ ₹30)"
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text("Total Photos: ${copies * 8} • Total Price: ₹${copies * 30}", fontWeight = FontWeight.Bold, color = AccentEmerald, fontSize = 13.sp)
            }
        }

        // Print Button
        Button(
            onClick = {
                if (passportSheetBitmap == null) {
                    Toast.makeText(context, "Please select customer photo first", Toast.LENGTH_SHORT).show()
                    return@Button
                }
                try {
                    val tempFile = File(context.cacheDir, "passport_8up_print.jpg")
                    FileOutputStream(tempFile).use { out ->
                        passportSheetBitmap!!.compress(Bitmap.CompressFormat.JPEG, 98, out)
                    }
                    val opts = PrintJobOptions(
                        colorMode = "COLOR",
                        paperSize = "4X6",
                        paperType = "PHOTO_4X6",
                        orientation = "LANDSCAPE",
                        enableBorder = false
                    )
                    SmartTankPrintAdapter.launchPrint(context, tempFile, "Passport_8Up_HP4x6", opts)
                } catch (e: Exception) {
                    Toast.makeText(context, "Error printing passport photos: ${e.message}", Toast.LENGTH_LONG).show()
                }
            },
            modifier = Modifier.fillMaxWidth().height(50.dp),
            shape = RoundedCornerShape(10.dp),
            colors = ButtonDefaults.buttonColors(containerColor = BrandBlue)
        ) {
            Icon(Icons.Default.Print, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Print 8-Up Passport Sheet (4×6 HP Paper)", fontWeight = FontWeight.Bold, fontSize = 15.sp)
        }
    }
}
