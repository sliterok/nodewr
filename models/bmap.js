/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('bmap', {
    id: {
      type: DataTypes.INTEGER(6),
      allowNull: true,
      unique: true
    },
    Country: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    uid: {
      type: DataTypes.INTEGER(11),
      allowNull: false
    },
    sp: {
      type: DataTypes.INTEGER(4),
      allowNull: true
    }
  }, {
    tableName: 'bmap'
  });
};
