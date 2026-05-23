const express = require('express');
const { validate, requireInternalKey } = require('../middleware/validate');
const productController = require('../controllers/productController');

const router = express.Router();

router.get('/health', productController.health);
router.get('/', validate(productController.listSchema), productController.list);
router.get('/categories/list', productController.categories);
router.get('/:id', validate(productController.idSchema), productController.getById);

router.post('/internal/by-ids', requireInternalKey, validate(productController.idsSchema), productController.byIds);
router.post('/internal/reserve', requireInternalKey, validate(productController.stockSchema), productController.reserve);
router.post('/internal/confirm', requireInternalKey, validate(productController.stockSchema), productController.confirm);
router.post('/internal/release', requireInternalKey, validate(productController.stockSchema), productController.release);

module.exports = router;
