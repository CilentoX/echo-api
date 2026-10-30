const express = require("express");
const multer = require("multer");
const router = express.Router();
const { uploadFile, deleteFile } = require("../controllers/UploadController");
const { MAX_FILE_SIZE } = require("../config/storage");

// Configuração do multer para upload de arquivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, require("path").join(__dirname, "..", "uploads"));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = require("uuid").v4() + "-" + Date.now();
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo de arquivo não permitido"));
    }
  },
});

router.post("/", upload.single("file"), uploadFile);
router.delete("/:fileId", deleteFile);

module.exports = router;
